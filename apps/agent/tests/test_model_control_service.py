"""Use-case contracts for dynamic model configuration control."""

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

from agno.models.base import Model
from agno.models.response import ModelResponse
from pydantic import SecretStr
import pytest

from agent_service.config import ActiveModelSettings
from agent_service.model_config_crypto import ModelConfigCipher, SealedSecret
from agent_service.model_config_repository import (
    ControlEvent,
    ActiveConfigPointer,
    CommitVerifiedActivation,
    ModelConfigConflictError,
    ModelConfigNotFoundError,
    ModelConfigRepository,
    ModelConfigStorageError,
    SaveSealedConfig,
    StoredActiveConfig,
    StoredSealedConfig,
)
from agent_service.model_config_types import (
    ModelConfigDraft,
    ModelProvider,
    StoredModelConfigMetadata,
)
from agent_service.model_control_auth import ModelControlAssertion
from agent_service.model_control_service import (
    ModelControlDisabledError,
    ModelControlEndpointError,
    ModelControlConflictError,
    ModelControlAssistantError,
    ModelControlEncryptionError,
    ModelControlProviderError,
    ModelControlService,
    ModelControlStorageError,
    ModelControlValidationError,
)
from agent_service.model_registry import build_managed_model
from agent_service.model_endpoint_catalog import (
    ModelEndpoint,
    ModelEndpointCatalog,
)
from agent_service.model_runtime_slot import ModelRuntimeSlot
from agent_service.model_runtime_slot import RuntimeModelMetadata, RuntimeModelStatus
from agent_service.model_runtime_types import ManagedModel
from agent_service.model_verifier import ModelVerificationResult, verify_model


ACTOR_ID = UUID("10000000-0000-4000-8000-000000000001")
REQUEST_ID = UUID("20000000-0000-4000-8000-000000000001")
ASSERTION_NONCE = UUID("30000000-0000-4000-8000-000000000001")
CONFIG_ID = UUID("40000000-0000-4000-8000-000000000001")
EVENT_ID = UUID("50000000-0000-4000-8000-000000000001")
SECOND_EVENT_ID = UUID("50000000-0000-4000-8000-000000000002")
SECOND_REQUEST_ID = UUID("20000000-0000-4000-8000-000000000002")
SECOND_ASSERTION_NONCE = UUID("30000000-0000-4000-8000-000000000002")
MASTER_KEY = SecretStr("11" * 32)
API_KEY = "test-api-key-do-not-log"


def assertion(
    *,
    action: str = "save",
    provider: ModelProvider = "openai",
    request_id: UUID = REQUEST_ID,
    nonce: UUID = ASSERTION_NONCE,
    permission: str | None = None,
) -> ModelControlAssertion:
    resolved_permission = permission or (
        "admin:assistant:secret:reveal"
        if action == "reveal"
        else "admin:assistant:configure"
    )
    return ModelControlAssertion(
        actor=ACTOR_ID,
        permission=cast(object, resolved_permission),  # type: ignore[arg-type]
        request_id=request_id,
        action=cast(object, action),  # type: ignore[arg-type]
        provider=provider,
        issued_at=1,
        expires_at=2,
        nonce=nonce,
    )


def metadata(
    *,
    provider: ModelProvider = "openai",
    revision: int = 1,
) -> StoredModelConfigMetadata:
    return StoredModelConfigMetadata(
        provider=provider,
        model_id="gpt-5-mini",
        endpoint_id=f"{provider}-official",
        api_key_last_four="-log",
        revision=revision,
        test_status="untested",
    )


@dataclass
class ListingRepository:
    rows: list[StoredModelConfigMetadata] = field(default_factory=list)
    calls: list[str] = field(default_factory=list)

    async def list_metadata(self) -> list[StoredModelConfigMetadata]:
        self.calls.append("list_metadata")
        return list(self.rows)


@dataclass
class SavingRepository(ListingRepository):
    current: StoredSealedConfig | None = None
    saved: list[tuple[SaveSealedConfig, ControlEvent]] = field(default_factory=list)
    save_error: Exception | None = None

    async def load_sealed(self, provider: ModelProvider) -> StoredSealedConfig:
        self.calls.append(f"load_sealed:{provider}")
        assert self.current is not None
        return self.current

    async def save_draft(
        self,
        command: SaveSealedConfig,
        event: ControlEvent,
    ) -> StoredModelConfigMetadata:
        self.calls.append("save_draft")
        if self.save_error is not None:
            raise self.save_error
        self.saved.append((command, event))
        return StoredModelConfigMetadata(
            provider=command.provider,
            model_id=command.model_id,
            endpoint_id=command.endpoint_id,
            api_key_last_four=command.sealed.last_four,
            revision=command.revision,
            test_status="untested",
        )


@dataclass
class ProbeModel(Model):
    id: str = "probe"
    name: str = "ProbeModel"
    provider: str = "offline"

    def invoke(self, *_args: object, **_kwargs: object) -> ModelResponse:
        return ModelResponse(role="assistant", content="ok")

    async def ainvoke(self, *_args: object, **_kwargs: object) -> ModelResponse:
        return ModelResponse(role="assistant", content="ok")

    def invoke_stream(
        self,
        *_args: object,
        **_kwargs: object,
    ) -> Iterator[ModelResponse]:
        yield self.invoke()

    async def ainvoke_stream(
        self,
        *_args: object,
        **_kwargs: object,
    ) -> AsyncIterator[ModelResponse]:
        yield await self.ainvoke()

    def _parse_provider_response(
        self,
        response: Any,
        **_kwargs: Any,
    ) -> ModelResponse:
        return ModelResponse(role="assistant", content=str(response))

    def _parse_provider_response_delta(self, response: Any) -> ModelResponse:
        return ModelResponse(role="assistant", content=str(response))


@dataclass
class Candidate:
    provider: ModelProvider
    managed: ManagedModel
    close_count: int = 0
    close_entered: asyncio.Event | None = None
    close_release: asyncio.Event | None = None
    close_error: BaseException | None = None


def make_candidate(
    provider: ModelProvider,
    *,
    close_entered: asyncio.Event | None = None,
    close_release: asyncio.Event | None = None,
    close_error: BaseException | None = None,
) -> Candidate:
    candidate: Candidate

    async def close() -> None:
        candidate.close_count += 1
        if close_entered is not None:
            close_entered.set()
        if close_release is not None:
            await close_release.wait()
        if close_error is not None:
            raise close_error

    candidate = Candidate(
        provider=provider,
        managed=ManagedModel(
            model=ProbeModel(id=f"{provider}-candidate", provider=provider),
            close_callback=close,
        ),
        close_entered=close_entered,
        close_release=close_release,
        close_error=close_error,
    )
    return candidate


@dataclass
class ControlRepository(SavingRepository):
    sealed_by_provider: dict[ModelProvider, StoredSealedConfig] = field(
        default_factory=dict
    )
    failed_tests: list[tuple[ModelProvider, int, ControlEvent]] = field(
        default_factory=list
    )
    activation_commands: list[tuple[CommitVerifiedActivation, ControlEvent]] = field(
        default_factory=list
    )
    activation_version: int = 0
    active_provider: ModelProvider | None = None
    record_error: Exception | None = None
    commit_error: Exception | None = None
    commit_entered: asyncio.Event | None = None
    commit_release: asyncio.Event | None = None
    reveal_config: StoredSealedConfig | None = None
    reveal_result: str = "committed"
    reveal_success_error: Exception | None = None
    reveal_failure_error: Exception | None = None
    reveal_events: list[tuple[str, ModelProvider, int, ControlEvent]] = field(
        default_factory=list
    )
    reveal_attempts: list[ControlEvent] = field(default_factory=list)

    async def load_sealed(self, provider: ModelProvider) -> StoredSealedConfig:
        self.calls.append(f"load_sealed:{provider}")
        return self.sealed_by_provider[provider]

    async def record_failed_test(
        self,
        provider: ModelProvider,
        revision: int,
        event: ControlEvent,
    ) -> None:
        self.calls.append(f"record_failed:{provider}")
        if self.record_error is not None:
            raise self.record_error
        self.failed_tests.append((provider, revision, event))

    async def load_active(self) -> StoredActiveConfig | None:
        self.calls.append("load_active")
        if self.activation_version == 0:
            return None
        assert self.active_provider is not None
        stored = self.sealed_by_provider[self.active_provider]
        return StoredActiveConfig(
            config_id=stored.config_id,
            provider=stored.provider,
            model_id=stored.model_id,
            endpoint_id=stored.endpoint_id,
            revision=stored.revision,
            test_status="passed",
            sealed=stored.sealed,
            activation_version=self.activation_version,
            activated_at=datetime(2026, 7, 18, tzinfo=UTC),
        )

    async def commit_test_and_activation(
        self,
        command: CommitVerifiedActivation,
        event: ControlEvent,
    ) -> ActiveConfigPointer:
        self.calls.append(f"commit_activation:{command.provider}")
        if self.commit_entered is not None:
            self.commit_entered.set()
        if self.commit_release is not None:
            await self.commit_release.wait()
        if self.commit_error is not None:
            raise self.commit_error
        assert command.expected_activation_version == self.activation_version
        self.activation_version += 1
        self.active_provider = command.provider
        self.activation_commands.append((command, event))
        return ActiveConfigPointer(
            config_id=self.sealed_by_provider[command.provider].config_id,
            provider=command.provider,
            config_revision=command.config_revision,
            activation_version=self.activation_version,
            activated_at=datetime(2026, 7, 18, tzinfo=UTC),
        )

    async def load_for_reveal(
        self,
        provider: ModelProvider,
        revision: int,
    ) -> StoredSealedConfig:
        self.calls.append(f"load_for_reveal:{provider}:{revision}")
        assert self.reveal_config is not None
        return self.reveal_config

    async def commit_reveal_success(
        self,
        provider: ModelProvider,
        revision: int,
        event: ControlEvent,
    ) -> str:
        self.calls.append("commit_reveal_success")
        self.reveal_attempts.append(event)
        if self.reveal_success_error is not None:
            raise self.reveal_success_error
        self.reveal_events.append(("success", provider, revision, event))
        return self.reveal_result

    async def commit_reveal_failure(
        self,
        provider: ModelProvider,
        revision: int,
        event: ControlEvent,
    ) -> None:
        self.calls.append("commit_reveal_failure")
        self.reveal_attempts.append(event)
        if self.reveal_failure_error is not None:
            raise self.reveal_failure_error
        self.reveal_events.append(("failure", provider, revision, event))


@dataclass
class CapturingSlot:
    activated: list[tuple[ManagedModel, int, RuntimeModelMetadata]] = field(
        default_factory=list
    )
    status: RuntimeModelStatus = RuntimeModelStatus(
        capability="placeholder",
        source=None,
        provider=None,
        model_id=None,
        config_revision=None,
        activation_version=None,
    )
    fail_activation: bool = False
    deactivations: list[str] = field(default_factory=list)

    def activate(
        self,
        managed: ManagedModel,
        activation_version: int,
        metadata_value: RuntimeModelMetadata,
    ) -> None:
        if self.fail_activation:
            raise RuntimeError("slot rejected committed candidate")
        self.activated.append((managed, activation_version, metadata_value))
        self.status = RuntimeModelStatus(
            capability="available",
            source="dynamic",
            provider=metadata_value.provider,
            model_id=metadata_value.model_id,
            config_revision=metadata_value.config_revision,
            activation_version=activation_version,
        )

    def runtime_status(self) -> RuntimeModelStatus:
        return self.status

    def deactivate(self, *, capability: str = "placeholder") -> None:
        self.deactivations.append(capability)
        self.status = RuntimeModelStatus(
            capability=cast(Any, capability),
            source=None,
            provider=None,
            model_id=None,
            config_revision=None,
            activation_version=None,
        )


def endpoint_catalog() -> ModelEndpointCatalog:
    return ModelEndpointCatalog(
        (
            ModelEndpoint(
                id="openai-official",
                label="OpenAI official",
                provider="openai",
                base_url="https://api.openai.com/v1",
            ),
            ModelEndpoint(
                id="anthropic-official",
                label="Anthropic official",
                provider="anthropic",
                base_url="https://api.anthropic.com",
            ),
        )
    )


def service(
    repository: object,
    *,
    control_enabled: bool = True,
    bootstrap_model: ActiveModelSettings | None = None,
    slot: object | None = None,
    model_builder: Callable[[ActiveModelSettings], ManagedModel] | None = None,
    verifier: Callable[..., Awaitable[ModelVerificationResult]] | None = None,
    uuid_values: tuple[UUID, ...] = (CONFIG_ID, EVENT_ID),
) -> ModelControlService:
    return ModelControlService(
        repository=cast(ModelConfigRepository, repository),
        cipher=ModelConfigCipher(master_key=MASTER_KEY),
        endpoint_catalog=endpoint_catalog(),
        slot=cast(ModelRuntimeSlot, slot or ModelRuntimeSlot()),
        bootstrap_model=bootstrap_model,
        control_enabled=control_enabled,
        uuid_factory=iter(uuid_values).__next__,
        model_builder=model_builder or build_managed_model,
        verifier=verifier or verify_model,
    )


@pytest.mark.asyncio
async def test_list_exposes_only_safe_dynamic_and_read_only_bootstrap_metadata() -> (
    None
):
    repository = ListingRepository(rows=[metadata()])
    bootstrap = ActiveModelSettings(
        provider="anthropic",
        model_id="claude-sonnet-4-5",
        api_key=SecretStr("bootstrap-secret-do-not-log"),
        base_url="https://private-bootstrap.example/v1",
        timeout_seconds=50,
    )

    result = await service(repository, bootstrap_model=bootstrap).list_model_configs()

    assert result.configs == (metadata(),)
    assert [(item.id, item.provider) for item in result.endpoints] == [
        ("openai-official", "openai"),
        ("anthropic-official", "anthropic"),
    ]
    assert result.bootstrap is not None
    assert result.bootstrap.provider == "anthropic"
    assert result.bootstrap.model_id == "claude-sonnet-4-5"
    assert result.bootstrap.read_only is True
    assert set(result.bootstrap.__dataclass_fields__) == {
        "provider",
        "model_id",
        "read_only",
    }
    assert result.control_enabled is True
    assert API_KEY not in repr(result)
    assert "bootstrap-secret-do-not-log" not in repr(result)
    assert "private-bootstrap" not in repr(result)
    assert repository.calls == ["list_metadata"]


@pytest.mark.asyncio
async def test_deployment_kill_switch_rejects_save_before_dependencies() -> None:
    repository = ListingRepository()
    draft = ModelConfigDraft(
        provider="openai",
        model_id="gpt-5-mini",
        endpoint_id="openai-official",
        api_key=SecretStr(API_KEY),
        expected_revision=0,
    )

    with pytest.raises(ModelControlDisabledError, match="^control_disabled$"):
        await service(repository, control_enabled=False).save_model_config(
            draft,
            assertion(),
        )

    assert repository.calls == []


@pytest.mark.asyncio
async def test_save_rejects_provider_mismatched_endpoint_before_encryption() -> None:
    repository = ListingRepository()
    draft = ModelConfigDraft(
        provider="openai",
        model_id="gpt-5-mini",
        endpoint_id="anthropic-official",
        api_key=SecretStr(API_KEY),
        expected_revision=0,
    )

    with pytest.raises(ModelControlEndpointError, match="^endpoint_not_allowed$"):
        await service(repository).save_model_config(draft, assertion())

    assert repository.calls == []


@pytest.mark.asyncio
async def test_save_with_new_key_seals_one_new_revision_and_returns_metadata_only() -> (
    None
):
    repository = SavingRepository()
    draft = ModelConfigDraft(
        provider="openai",
        model_id="gpt-5-mini",
        endpoint_id="openai-official",
        api_key=SecretStr(API_KEY),
        expected_revision=0,
    )

    result = await service(repository).save_model_config(draft, assertion())

    assert result == metadata()
    [(command, event)] = repository.saved
    assert command.config_id == CONFIG_ID
    assert command.revision == 1
    assert command.expected_revision == 0
    assert command.assertion_nonce == ASSERTION_NONCE
    assert command.sealed.last_four == "-log"
    assert API_KEY.encode() not in command.sealed.ciphertext
    assert event == ControlEvent(
        event_id=EVENT_ID,
        request_id=REQUEST_ID,
        assertion_nonce=ASSERTION_NONCE,
        actor_user_id=ACTOR_ID,
        action="model_config_saved",
        provider="openai",
        model_id="gpt-5-mini",
        endpoint_id="openai-official",
        config_revision=1,
        result="success",
    )
    assert API_KEY not in repr(result)
    assert API_KEY not in repr(command)


@pytest.mark.asyncio
async def test_save_translates_repository_revision_conflict_without_exception_chain() -> (
    None
):
    repository = SavingRepository(
        save_error=ModelConfigConflictError("configuration_conflict")
    )
    draft = ModelConfigDraft(
        provider="openai",
        model_id="gpt-5-mini",
        endpoint_id="openai-official",
        api_key=SecretStr(API_KEY),
        expected_revision=0,
    )

    with pytest.raises(
        ModelControlConflictError,
        match="^configuration_conflict$",
    ) as error:
        await service(repository).save_model_config(draft, assertion())

    assert error.value.__cause__ is None
    assert error.value.__context__ is None


@pytest.mark.asyncio
async def test_save_without_key_decrypts_and_reseals_under_new_identity() -> None:
    cipher = ModelConfigCipher(master_key=MASTER_KEY)
    old_id = UUID("60000000-0000-4000-8000-000000000001")
    old_sealed = cipher.seal(
        config_id=old_id,
        provider="openai",
        revision=1,
        secret=SecretStr(API_KEY),
    )
    repository = SavingRepository(
        current=StoredSealedConfig(
            config_id=old_id,
            provider="openai",
            model_id="gpt-4.1-mini",
            endpoint_id="openai-official",
            revision=1,
            test_status="passed",
            sealed=old_sealed,
        )
    )
    draft = ModelConfigDraft(
        provider="openai",
        model_id="gpt-5-mini",
        endpoint_id="openai-official",
        api_key=None,
        expected_revision=1,
    )

    result = await service(repository).save_model_config(draft, assertion())

    [(command, _event)] = repository.saved
    assert result.revision == 2
    assert command.config_id == CONFIG_ID
    assert command.sealed.ciphertext != old_sealed.ciphertext
    assert command.sealed.nonce != old_sealed.nonce
    assert (
        cipher.open(
            config_id=command.config_id,
            provider="openai",
            revision=2,
            sealed=command.sealed,
        ).get_secret_value()
        == API_KEY
    )
    assert (
        cipher.open(
            config_id=old_id,
            provider="openai",
            revision=1,
            sealed=old_sealed,
        ).get_secret_value()
        == API_KEY
    )
    assert repository.calls == ["load_sealed:openai", "save_draft"]


def stored_candidate(
    provider: ModelProvider,
    *,
    revision: int = 1,
) -> StoredSealedConfig:
    config_id = {
        "openai": UUID("70000000-0000-4000-8000-000000000001"),
        "anthropic": UUID("70000000-0000-4000-8000-000000000002"),
    }[provider]
    cipher = ModelConfigCipher(master_key=MASTER_KEY)
    return StoredSealedConfig(
        config_id=config_id,
        provider=provider,
        model_id="gpt-5-mini" if provider == "openai" else "claude-sonnet-4-5",
        endpoint_id=f"{provider}-official",
        revision=revision,
        test_status="untested",
        sealed=cipher.seal(
            config_id=config_id,
            provider=provider,
            revision=revision,
            secret=SecretStr(f"{provider}-candidate-key"),
        ),
    )


@pytest.mark.asyncio
async def test_cross_provider_verification_overlaps_before_activation_lock() -> None:
    repository = ControlRepository(
        sealed_by_provider={
            "openai": stored_candidate("openai"),
            "anthropic": stored_candidate("anthropic"),
        }
    )
    slot = CapturingSlot()
    candidates: dict[ModelProvider, Candidate] = {}
    both_entered = asyncio.Event()
    entered: set[str] = set()

    def builder(settings: ActiveModelSettings) -> ManagedModel:
        candidate = make_candidate(settings.provider)
        candidates[settings.provider] = candidate
        return candidate.managed

    async def verifier(
        _managed: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        assert timeout_seconds == 50
        provider = _managed.model.provider
        assert provider is not None
        entered.add(provider)
        if len(entered) == 2:
            both_entered.set()
        await asyncio.wait_for(both_entered.wait(), timeout=5)
        return ModelVerificationResult(True, "success")

    control = service(
        repository,
        slot=slot,
        model_builder=builder,
        verifier=verifier,
        uuid_values=(EVENT_ID, SECOND_EVENT_ID),
    )

    await asyncio.gather(
        control.test_and_activate(
            "openai",
            1,
            assertion(action="test_and_activate", provider="openai"),
        ),
        control.test_and_activate(
            "anthropic",
            1,
            assertion(
                action="test_and_activate",
                provider="anthropic",
                request_id=SECOND_REQUEST_ID,
                nonce=SECOND_ASSERTION_NONCE,
            ),
        ),
    )

    assert entered == {"openai", "anthropic"}
    assert repository.activation_version == 2
    assert repository.active_provider == slot.status.provider
    assert slot.status.activation_version == 2
    assert [
        command.expected_activation_version
        for command, _ in repository.activation_commands
    ] == [
        0,
        1,
    ]
    assert {
        (event.request_id, event.assertion_nonce)
        for _command, event in repository.activation_commands
    } == {
        (REQUEST_ID, ASSERTION_NONCE),
        (SECOND_REQUEST_ID, SECOND_ASSERTION_NONCE),
    }
    assert all(candidate.close_count == 0 for candidate in candidates.values())


@pytest.mark.asyncio
async def test_failed_verification_records_only_failed_test_and_closes_candidate() -> (
    None
):
    repository = ControlRepository(
        sealed_by_provider={"openai": stored_candidate("openai")}
    )
    slot = CapturingSlot()
    candidate = make_candidate("openai")

    async def verifier(
        _managed: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        return ModelVerificationResult(False, "credential_rejected")

    control = service(
        repository,
        slot=slot,
        model_builder=lambda _settings: candidate.managed,
        verifier=verifier,
        uuid_values=(EVENT_ID,),
    )

    with pytest.raises(
        ModelControlProviderError,
        match="^credential_rejected$",
    ):
        await control.test_and_activate(
            "openai",
            1,
            assertion(action="test_and_activate"),
        )

    [(provider, revision, event)] = repository.failed_tests
    assert (provider, revision) == ("openai", 1)
    assert event.action == "model_config_tested"
    assert event.result == "credential_rejected"
    assert repository.activation_commands == []
    assert slot.activated == []
    assert slot.deactivations == []
    assert candidate.close_count == 1


@pytest.mark.asyncio
async def test_activation_conflict_closes_verified_candidate() -> None:
    repository = ControlRepository(
        sealed_by_provider={"openai": stored_candidate("openai")},
        commit_error=ModelConfigConflictError("configuration_conflict"),
    )
    candidate = make_candidate("openai")

    async def verifier(
        _managed: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        return ModelVerificationResult(True, "success")

    control = service(
        repository,
        slot=CapturingSlot(),
        model_builder=lambda _settings: candidate.managed,
        verifier=verifier,
        uuid_values=(EVENT_ID,),
    )

    with pytest.raises(ModelControlConflictError, match="^configuration_conflict$"):
        await control.test_and_activate(
            "openai",
            1,
            assertion(action="test_and_activate"),
        )

    assert candidate.close_count == 1


@pytest.mark.asyncio
async def test_cancellation_during_verification_finishes_exactly_one_close() -> None:
    repository = ControlRepository(
        sealed_by_provider={"openai": stored_candidate("openai")}
    )
    verification_entered = asyncio.Event()
    close_entered = asyncio.Event()
    close_release = asyncio.Event()
    candidate = make_candidate(
        "openai",
        close_entered=close_entered,
        close_release=close_release,
    )

    async def verifier(
        _managed: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        verification_entered.set()
        await asyncio.Event().wait()
        raise AssertionError("unreachable")

    control = service(
        repository,
        slot=CapturingSlot(),
        model_builder=lambda _settings: candidate.managed,
        verifier=verifier,
    )
    task = asyncio.create_task(
        control.test_and_activate(
            "openai",
            1,
            assertion(action="test_and_activate"),
        )
    )
    await verification_entered.wait()
    task.cancel()
    await close_entered.wait()
    assert not task.done()
    close_release.set()

    with pytest.raises(asyncio.CancelledError):
        await task
    assert candidate.close_count == 1


@pytest.mark.parametrize(
    "verification",
    [
        ModelVerificationResult(True, "provider_unreachable"),
        ModelVerificationResult(False, "success"),
        (True, "success"),
        object(),
    ],
)
@pytest.mark.asyncio
async def test_only_exact_verifier_success_can_activate(verification: object) -> None:
    repository = ControlRepository(
        sealed_by_provider={"openai": stored_candidate("openai")}
    )
    candidate = make_candidate("openai")

    async def verifier(
        _managed: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        return cast(ModelVerificationResult, verification)

    with pytest.raises(
        ModelControlProviderError,
        match="^provider_unreachable$",
    ):
        await service(
            repository,
            slot=CapturingSlot(),
            model_builder=lambda _settings: candidate.managed,
            verifier=verifier,
            uuid_values=(EVENT_ID,),
        ).test_and_activate(
            "openai",
            1,
            assertion(action="test_and_activate"),
        )

    assert repository.activation_commands == []
    assert repository.failed_tests[0][2].result == "provider_unreachable"
    assert candidate.close_count == 1


@pytest.mark.asyncio
async def test_slot_failure_after_database_commit_degrades_and_closes_candidate() -> (
    None
):
    repository = ControlRepository(
        sealed_by_provider={"openai": stored_candidate("openai")}
    )
    candidate = make_candidate("openai")
    slot = CapturingSlot(fail_activation=True)

    async def verifier(
        _managed: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        return ModelVerificationResult(True, "success")

    with pytest.raises(
        ModelControlAssistantError,
        match="^assistant_unavailable$",
    ) as error:
        await service(
            repository,
            slot=slot,
            model_builder=lambda _settings: candidate.managed,
            verifier=verifier,
            uuid_values=(EVENT_ID,),
        ).test_and_activate(
            "openai",
            1,
            assertion(action="test_and_activate"),
        )

    assert repository.activation_version == 1
    assert error.value.test_succeeded is True
    assert slot.deactivations == ["degraded"]
    assert slot.status.capability == "degraded"
    assert candidate.close_count == 1


@pytest.mark.asyncio
async def test_cancellation_while_closing_failed_candidate_finishes_one_close() -> None:
    repository = ControlRepository(
        sealed_by_provider={"openai": stored_candidate("openai")}
    )
    close_entered = asyncio.Event()
    close_release = asyncio.Event()
    candidate = make_candidate(
        "openai",
        close_entered=close_entered,
        close_release=close_release,
    )

    async def verifier(
        _managed: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        return ModelVerificationResult(False, "provider_timeout")

    task = asyncio.create_task(
        service(
            repository,
            slot=CapturingSlot(),
            model_builder=lambda _settings: candidate.managed,
            verifier=verifier,
            uuid_values=(EVENT_ID,),
        ).test_and_activate(
            "openai",
            1,
            assertion(action="test_and_activate"),
        )
    )
    await close_entered.wait()
    task.cancel()
    await asyncio.sleep(0)
    assert not task.done()
    close_release.set()

    with pytest.raises(asyncio.CancelledError):
        await task
    assert candidate.close_count == 1


@pytest.mark.asyncio
async def test_cancellation_during_activation_commit_waits_then_transfers_candidate() -> (
    None
):
    commit_entered = asyncio.Event()
    commit_release = asyncio.Event()
    repository = ControlRepository(
        sealed_by_provider={"openai": stored_candidate("openai")},
        commit_entered=commit_entered,
        commit_release=commit_release,
    )
    candidate = make_candidate("openai")
    slot = CapturingSlot()

    async def verifier(
        _managed: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        return ModelVerificationResult(True, "success")

    task = asyncio.create_task(
        service(
            repository,
            slot=slot,
            model_builder=lambda _settings: candidate.managed,
            verifier=verifier,
            uuid_values=(EVENT_ID,),
        ).test_and_activate(
            "openai",
            1,
            assertion(action="test_and_activate"),
        )
    )
    await commit_entered.wait()
    task.cancel()
    await asyncio.sleep(0)
    assert not task.done()
    commit_release.set()

    with pytest.raises(asyncio.CancelledError):
        await task
    assert candidate.close_count == 0
    assert repository.activation_version == 1
    assert slot.status.activation_version == 1


@pytest.mark.asyncio
async def test_cancellation_after_commit_side_effect_activates_slot_before_propagating() -> (
    None
):
    commit_side_effect = asyncio.Event()
    allow_commit_return = asyncio.Event()

    class SideEffectFirstRepository(ControlRepository):
        async def commit_test_and_activation(
            self,
            command: CommitVerifiedActivation,
            event: ControlEvent,
        ) -> ActiveConfigPointer:
            assert command.expected_activation_version == self.activation_version
            self.activation_version += 1
            self.active_provider = command.provider
            self.activation_commands.append((command, event))
            pointer = ActiveConfigPointer(
                config_id=self.sealed_by_provider[command.provider].config_id,
                provider=command.provider,
                config_revision=command.config_revision,
                activation_version=self.activation_version,
                activated_at=datetime(2026, 7, 18, tzinfo=UTC),
            )
            commit_side_effect.set()
            await allow_commit_return.wait()
            return pointer

    repository = SideEffectFirstRepository(
        sealed_by_provider={"openai": stored_candidate("openai")}
    )
    candidate = make_candidate("openai")
    slot = CapturingSlot()

    async def verifier(
        _managed: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        return ModelVerificationResult(True, "success")

    task = asyncio.create_task(
        service(
            repository,
            slot=slot,
            model_builder=lambda _settings: candidate.managed,
            verifier=verifier,
            uuid_values=(EVENT_ID,),
        ).test_and_activate(
            "openai",
            1,
            assertion(action="test_and_activate"),
        )
    )
    await commit_side_effect.wait()
    task.cancel()
    await asyncio.sleep(0)
    assert not task.done()
    allow_commit_return.set()

    with pytest.raises(asyncio.CancelledError):
        await task
    assert repository.activation_version == 1
    assert repository.active_provider == "openai"
    assert slot.status.provider == "openai"
    assert slot.status.activation_version == 1
    assert candidate.close_count == 0


@pytest.mark.parametrize(
    "malformed_pointer",
    [
        object(),
        ActiveConfigPointer(
            config_id=UUID("79999999-0000-4000-8000-000000000001"),
            provider="openai",
            config_revision=1,
            activation_version=1,
            activated_at=datetime(2026, 7, 18, tzinfo=UTC),
        ),
        ActiveConfigPointer(
            config_id=UUID("70000000-0000-4000-8000-000000000001"),
            provider="anthropic",
            config_revision=1,
            activation_version=1,
            activated_at=datetime(2026, 7, 18, tzinfo=UTC),
        ),
        ActiveConfigPointer(
            config_id=UUID("70000000-0000-4000-8000-000000000001"),
            provider="openai",
            config_revision=2,
            activation_version=1,
            activated_at=datetime(2026, 7, 18, tzinfo=UTC),
        ),
        ActiveConfigPointer(
            config_id=UUID("70000000-0000-4000-8000-000000000001"),
            provider="openai",
            config_revision=1,
            activation_version=2,
            activated_at=datetime(2026, 7, 18, tzinfo=UTC),
        ),
    ],
)
@pytest.mark.asyncio
async def test_malformed_committed_pointer_degrades_without_activation(
    malformed_pointer: object,
) -> None:
    class MalformedPointerRepository(ControlRepository):
        async def commit_test_and_activation(
            self,
            command: CommitVerifiedActivation,
            event: ControlEvent,
        ) -> ActiveConfigPointer:
            self.activation_version += 1
            self.active_provider = command.provider
            self.activation_commands.append((command, event))
            return cast(ActiveConfigPointer, malformed_pointer)

    repository = MalformedPointerRepository(
        sealed_by_provider={"openai": stored_candidate("openai")}
    )
    candidate = make_candidate("openai")
    slot = CapturingSlot()

    async def verifier(
        _managed: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        return ModelVerificationResult(True, "success")

    with pytest.raises(
        ModelControlAssistantError,
        match="^assistant_unavailable$",
    ) as error:
        await service(
            repository,
            slot=slot,
            model_builder=lambda _settings: candidate.managed,
            verifier=verifier,
            uuid_values=(EVENT_ID,),
        ).test_and_activate(
            "openai",
            1,
            assertion(action="test_and_activate"),
        )

    assert slot.activated == []
    assert slot.deactivations == ["degraded"]
    assert candidate.close_count == 1
    assert error.value.__cause__ is None
    assert error.value.__context__ is None


@pytest.mark.asyncio
async def test_malformed_active_pointer_read_fails_before_commit() -> None:
    class MalformedActiveRepository(ControlRepository):
        async def load_active(self) -> StoredActiveConfig | None:
            return cast(StoredActiveConfig, object())

    repository = MalformedActiveRepository(
        sealed_by_provider={"openai": stored_candidate("openai")}
    )
    candidate = make_candidate("openai")
    slot = CapturingSlot()

    async def verifier(
        _managed: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        return ModelVerificationResult(True, "success")

    with pytest.raises(
        ModelControlStorageError,
        match="^storage_unavailable$",
    ) as error:
        await service(
            repository,
            slot=slot,
            model_builder=lambda _settings: candidate.managed,
            verifier=verifier,
            uuid_values=(EVENT_ID,),
        ).test_and_activate(
            "openai",
            1,
            assertion(action="test_and_activate"),
        )

    assert repository.activation_commands == []
    assert slot.activated == []
    assert slot.deactivations == []
    assert candidate.close_count == 1
    assert error.value.__cause__ is None
    assert error.value.__context__ is None


@pytest.mark.asyncio
async def test_uncertain_commit_failure_degrades_old_slot_and_closes_candidate() -> (
    None
):
    class CommitThenLoseConfirmationRepository(ControlRepository):
        async def commit_test_and_activation(
            self,
            command: CommitVerifiedActivation,
            event: ControlEvent,
        ) -> ActiveConfigPointer:
            assert command.expected_activation_version == 1
            self.activation_version = 2
            self.active_provider = command.provider
            self.activation_commands.append((command, event))
            raise ModelConfigStorageError("storage_unavailable")

    repository = CommitThenLoseConfirmationRepository(
        sealed_by_provider={
            "openai": stored_candidate("openai"),
            "anthropic": stored_candidate("anthropic"),
        },
        activation_version=1,
        active_provider="anthropic",
    )
    candidate = make_candidate("openai")
    slot = CapturingSlot(
        status=RuntimeModelStatus(
            capability="available",
            source="dynamic",
            provider="anthropic",
            model_id="claude-sonnet-4-5",
            config_revision=1,
            activation_version=1,
        )
    )

    async def verifier(
        _managed: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        return ModelVerificationResult(True, "success")

    with pytest.raises(
        ModelControlStorageError,
        match="^storage_unavailable$",
    ) as error:
        await service(
            repository,
            slot=slot,
            model_builder=lambda _settings: candidate.managed,
            verifier=verifier,
            uuid_values=(EVENT_ID,),
        ).test_and_activate(
            "openai",
            1,
            assertion(action="test_and_activate"),
        )

    assert repository.activation_version == 2
    assert repository.active_provider == "openai"
    assert slot.status.capability == "degraded"
    assert slot.status.provider is None
    assert slot.deactivations == ["degraded"]
    assert candidate.close_count == 1
    assert error.value.__cause__ is None
    assert error.value.__context__ is None


@pytest.mark.asyncio
async def test_candidate_close_failure_is_fixed_and_not_chained() -> None:
    repository = ControlRepository(
        sealed_by_provider={"openai": stored_candidate("openai")}
    )
    candidate = make_candidate(
        "openai",
        close_error=RuntimeError("private close failure"),
    )

    async def verifier(
        _managed: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        return ModelVerificationResult(False, "provider_timeout")

    with pytest.raises(
        ModelControlAssistantError,
        match="^assistant_unavailable$",
    ) as error:
        await service(
            repository,
            slot=CapturingSlot(),
            model_builder=lambda _settings: candidate.managed,
            verifier=verifier,
            uuid_values=(EVENT_ID,),
        ).test_and_activate(
            "openai",
            1,
            assertion(action="test_and_activate"),
        )

    assert candidate.close_count == 1
    assert error.value.__cause__ is None
    assert error.value.__context__ is None


@pytest.mark.asyncio
async def test_missing_current_key_rejects_omitted_key_save_as_conflict() -> None:
    class MissingRepository(SavingRepository):
        async def load_sealed(self, provider: ModelProvider) -> StoredSealedConfig:
            raise ModelConfigNotFoundError("model_configuration_not_found")

    draft = ModelConfigDraft(
        provider="openai",
        model_id="gpt-5-mini",
        endpoint_id="openai-official",
        api_key=None,
        expected_revision=1,
    )

    with pytest.raises(
        ModelControlConflictError,
        match="^configuration_conflict$",
    ) as error:
        await service(MissingRepository()).save_model_config(draft, assertion())

    assert error.value.__cause__ is None
    assert error.value.__context__ is None


@pytest.mark.parametrize(
    "loaded",
    [
        object(),
        stored_candidate("anthropic"),
    ],
)
@pytest.mark.asyncio
async def test_activation_rejects_wrong_loaded_identity_as_storage(
    loaded: object,
) -> None:
    class WrongIdentityRepository(ControlRepository):
        async def load_sealed(self, provider: ModelProvider) -> StoredSealedConfig:
            return cast(StoredSealedConfig, loaded)

    repository = WrongIdentityRepository()

    with pytest.raises(
        ModelControlStorageError,
        match="^storage_unavailable$",
    ) as error:
        await service(
            repository,
            model_builder=lambda _settings: (_ for _ in ()).throw(
                AssertionError("builder must not run")
            ),
        ).test_and_activate(
            "openai",
            1,
            assertion(action="test_and_activate"),
        )

    assert error.value.__cause__ is None
    assert error.value.__context__ is None


@pytest.mark.parametrize(
    "loaded",
    [
        object(),
        stored_candidate("anthropic"),
    ],
)
@pytest.mark.asyncio
async def test_omitted_key_save_rejects_wrong_loaded_identity_as_storage(
    loaded: object,
) -> None:
    repository = SavingRepository(current=cast(StoredSealedConfig, loaded))
    draft = ModelConfigDraft(
        provider="openai",
        model_id="gpt-5-mini",
        endpoint_id="openai-official",
        api_key=None,
        expected_revision=1,
    )

    with pytest.raises(
        ModelControlStorageError,
        match="^storage_unavailable$",
    ) as error:
        await service(repository).save_model_config(draft, assertion())

    assert repository.saved == []
    assert error.value.__cause__ is None
    assert error.value.__context__ is None


@pytest.mark.asyncio
async def test_unexpected_list_storage_failure_has_no_exception_chain() -> None:
    class FailingRepository(ListingRepository):
        async def list_metadata(self) -> list[StoredModelConfigMetadata]:
            raise RuntimeError("private database failure")

    with pytest.raises(
        ModelControlStorageError,
        match="^storage_unavailable$",
    ) as error:
        await service(FailingRepository()).list_model_configs()

    assert error.value.__cause__ is None
    assert error.value.__context__ is None


@pytest.mark.asyncio
async def test_reveal_commits_success_event_before_returning_one_secret() -> None:
    stored = stored_candidate("openai")
    repository = ControlRepository(reveal_config=stored)
    control = service(repository, uuid_values=(EVENT_ID,))

    revealed = await control.reveal_key(
        "openai",
        1,
        assertion(action="reveal"),
    )

    assert isinstance(revealed, SecretStr)
    assert revealed.get_secret_value() == "openai-candidate-key"
    assert repository.calls == [
        "load_for_reveal:openai:1",
        "commit_reveal_success",
    ]
    [(phase, provider, revision, event)] = repository.reveal_events
    assert (phase, provider, revision) == ("success", "openai", 1)
    assert event.action == "model_key_revealed"
    assert event.result == "success"
    assert event.assertion_nonce == ASSERTION_NONCE
    assert "openai-candidate-key" not in repr(event)


@pytest.mark.asyncio
async def test_reveal_stale_success_discards_plaintext_and_returns_conflict() -> None:
    repository = ControlRepository(
        reveal_config=stored_candidate("openai"),
        reveal_result="stale",
    )

    with pytest.raises(
        ModelControlConflictError,
        match="^configuration_conflict$",
    ) as error:
        await service(repository, uuid_values=(EVENT_ID,)).reveal_key(
            "openai",
            1,
            assertion(action="reveal"),
        )

    assert error.value.__cause__ is None
    assert error.value.__context__ is None
    assert len(repository.reveal_events) == 1


@pytest.mark.asyncio
async def test_reveal_unknown_commit_result_never_returns_plaintext() -> None:
    repository = ControlRepository(
        reveal_config=stored_candidate("openai"),
        reveal_result="unexpected",
    )

    with pytest.raises(
        ModelControlStorageError,
        match="^storage_unavailable$",
    ) as error:
        await service(repository, uuid_values=(EVENT_ID,)).reveal_key(
            "openai",
            1,
            assertion(action="reveal"),
        )

    assert error.value.__cause__ is None
    assert error.value.__context__ is None
    assert len(repository.reveal_attempts) == 1


@pytest.mark.parametrize(
    "loaded",
    [
        object(),
        stored_candidate("anthropic"),
    ],
)
@pytest.mark.asyncio
async def test_reveal_rejects_wrong_loaded_identity_as_storage(
    loaded: object,
) -> None:
    class WrongRevealRepository(ControlRepository):
        async def load_for_reveal(
            self,
            provider: ModelProvider,
            revision: int,
        ) -> StoredSealedConfig:
            return cast(StoredSealedConfig, loaded)

    repository = WrongRevealRepository()

    with pytest.raises(
        ModelControlStorageError,
        match="^storage_unavailable$",
    ) as error:
        await service(repository, uuid_values=()).reveal_key(
            "openai",
            1,
            assertion(action="reveal"),
        )

    assert repository.reveal_attempts == []
    assert error.value.__cause__ is None
    assert error.value.__context__ is None


@pytest.mark.asyncio
async def test_reveal_cancellation_traceback_contains_no_plaintext_reference() -> None:
    commit_entered = asyncio.Event()

    class BlockingRevealRepository(ControlRepository):
        async def commit_reveal_success(
            self,
            provider: ModelProvider,
            revision: int,
            event: ControlEvent,
        ) -> str:
            commit_entered.set()
            await asyncio.Event().wait()
            raise AssertionError("unreachable")

    repository = BlockingRevealRepository(reveal_config=stored_candidate("openai"))
    task = asyncio.create_task(
        service(repository, uuid_values=(EVENT_ID,)).reveal_key(
            "openai",
            1,
            assertion(action="reveal"),
        )
    )
    await commit_entered.wait()
    task.cancel()

    with pytest.raises(asyncio.CancelledError) as error:
        await task

    traceback = error.value.__traceback__
    assert traceback is not None
    while traceback is not None:
        for value in traceback.tb_frame.f_locals.values():
            assert not isinstance(value, SecretStr)
            assert not (type(value) is str and value == "openai-candidate-key")
        traceback = traceback.tb_next


@pytest.mark.asyncio
async def test_reveal_decrypt_failure_commits_failure_before_fixed_error() -> None:
    stored = stored_candidate("openai")
    corrupt = StoredSealedConfig(
        config_id=stored.config_id,
        provider=stored.provider,
        model_id=stored.model_id,
        endpoint_id=stored.endpoint_id,
        revision=stored.revision,
        test_status=stored.test_status,
        sealed=SealedSecret(
            ciphertext=b"x" * len(stored.sealed.ciphertext),
            nonce=stored.sealed.nonce,
            key_version=stored.sealed.key_version,
            last_four=stored.sealed.last_four,
        ),
    )
    repository = ControlRepository(reveal_config=corrupt)

    with pytest.raises(
        ModelControlEncryptionError,
        match="^encryption_unavailable$",
    ) as error:
        await service(repository, uuid_values=(EVENT_ID,)).reveal_key(
            "openai",
            1,
            assertion(action="reveal"),
        )

    assert repository.calls == [
        "load_for_reveal:openai:1",
        "commit_reveal_failure",
    ]
    [(_phase, _provider, _revision, event)] = repository.reveal_events
    assert event.result == "encryption_unavailable"
    assert event.assertion_nonce == ASSERTION_NONCE
    assert error.value.__cause__ is None
    assert error.value.__context__ is None


@pytest.mark.asyncio
async def test_reveal_event_commit_failure_never_returns_plaintext() -> None:
    repository = ControlRepository(
        reveal_config=stored_candidate("openai"),
        reveal_success_error=ModelConfigStorageError("storage_unavailable"),
    )

    with pytest.raises(
        ModelControlStorageError,
        match="^storage_unavailable$",
    ) as error:
        await service(repository, uuid_values=(EVENT_ID,)).reveal_key(
            "openai",
            1,
            assertion(action="reveal"),
        )

    assert repository.reveal_events == []
    assert [event.assertion_nonce for event in repository.reveal_attempts] == [
        ASSERTION_NONCE
    ]
    assert error.value.__cause__ is None
    assert error.value.__context__ is None


@pytest.mark.parametrize(
    ("repository_error", "expected_error"),
    [
        (
            ModelConfigStorageError("storage_unavailable"),
            ModelControlStorageError,
        ),
        (
            ModelConfigConflictError("configuration_conflict"),
            ModelControlConflictError,
        ),
    ],
)
@pytest.mark.asyncio
async def test_reveal_failure_event_commit_error_precedes_encryption_error(
    repository_error: Exception,
    expected_error: type[Exception],
) -> None:
    stored = stored_candidate("openai")
    corrupt = StoredSealedConfig(
        config_id=stored.config_id,
        provider=stored.provider,
        model_id=stored.model_id,
        endpoint_id=stored.endpoint_id,
        revision=stored.revision,
        test_status=stored.test_status,
        sealed=SealedSecret(
            ciphertext=b"z" * len(stored.sealed.ciphertext),
            nonce=stored.sealed.nonce,
            key_version=stored.sealed.key_version,
            last_four=stored.sealed.last_four,
        ),
    )
    repository = ControlRepository(
        reveal_config=corrupt,
        reveal_failure_error=repository_error,
    )

    with pytest.raises(expected_error) as error:
        await service(repository, uuid_values=(EVENT_ID,)).reveal_key(
            "openai",
            1,
            assertion(action="reveal"),
        )

    assert [event.assertion_nonce for event in repository.reveal_attempts] == [
        ASSERTION_NONCE
    ]
    assert error.value.__cause__ is None
    assert error.value.__context__ is None


@pytest.mark.asyncio
async def test_wrong_assertion_permission_is_rejected_before_dependencies() -> None:
    repository = ControlRepository(reveal_config=stored_candidate("openai"))

    with pytest.raises(ModelControlValidationError, match="^validation_error$"):
        await service(repository).reveal_key(
            "openai",
            1,
            assertion(
                action="reveal",
                permission="admin:assistant:configure",
            ),
        )

    assert repository.calls == []


@pytest.mark.parametrize("operation", ["save", "test_and_activate", "reveal"])
@pytest.mark.asyncio
async def test_kill_switch_rejects_every_mutation_before_dependencies(
    operation: str,
) -> None:
    repository = ControlRepository()
    control = service(repository, control_enabled=False, uuid_values=())

    with pytest.raises(ModelControlDisabledError, match="^control_disabled$"):
        if operation == "save":
            await control.save_model_config(
                ModelConfigDraft(
                    provider="openai",
                    model_id="gpt-5-mini",
                    endpoint_id="openai-official",
                    api_key=SecretStr(API_KEY),
                    expected_revision=0,
                ),
                assertion(),
            )
        elif operation == "test_and_activate":
            await control.test_and_activate(
                "openai",
                1,
                assertion(action="test_and_activate"),
            )
        else:
            await control.reveal_key(
                "openai",
                1,
                assertion(action="reveal"),
            )

    assert repository.calls == []


@pytest.mark.parametrize("operation", ["save", "test_and_activate", "reveal"])
@pytest.mark.asyncio
async def test_wrong_permission_rejects_every_mutation_before_dependencies(
    operation: str,
) -> None:
    repository = ControlRepository()
    control = service(repository, uuid_values=())

    with pytest.raises(ModelControlValidationError, match="^validation_error$"):
        if operation == "save":
            await control.save_model_config(
                ModelConfigDraft(
                    provider="openai",
                    model_id="gpt-5-mini",
                    endpoint_id="openai-official",
                    api_key=SecretStr(API_KEY),
                    expected_revision=0,
                ),
                assertion(
                    permission="admin:assistant:secret:reveal",
                ),
            )
        elif operation == "test_and_activate":
            await control.test_and_activate(
                "openai",
                1,
                assertion(
                    action="test_and_activate",
                    permission="admin:assistant:secret:reveal",
                ),
            )
        else:
            await control.reveal_key(
                "openai",
                1,
                assertion(
                    action="reveal",
                    permission="admin:assistant:configure",
                ),
            )

    assert repository.calls == []


@pytest.mark.parametrize("operation", ["test_and_activate", "reveal"])
@pytest.mark.asyncio
async def test_unknown_provider_is_rejected_before_repository(
    operation: str,
) -> None:
    repository = ControlRepository()
    control = service(repository, uuid_values=())
    unknown = cast(ModelProvider, "local")
    unknown_assertion = assertion(
        action=operation,
        provider=unknown,
    )

    with pytest.raises(ModelControlValidationError, match="^validation_error$"):
        if operation == "test_and_activate":
            await control.test_and_activate(unknown, 1, unknown_assertion)
        else:
            await control.reveal_key(unknown, 1, unknown_assertion)

    assert repository.calls == []


def test_runtime_status_reads_only_one_slot_snapshot() -> None:
    repository = ListingRepository(rows=[metadata()])
    slot = CapturingSlot(
        status=RuntimeModelStatus(
            capability="available",
            source="dynamic",
            provider="openai",
            model_id="gpt-5-mini",
            config_revision=7,
            activation_version=11,
        )
    )

    result = service(repository, slot=slot).runtime_status()

    assert result == RuntimeModelStatus(
        capability="available",
        source="dynamic",
        provider="openai",
        model_id="gpt-5-mini",
        config_revision=7,
        activation_version=11,
    )
    assert repository.calls == []
