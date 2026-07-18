"""Secret-minimizing orchestration for the model configuration control plane."""

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import NoReturn
from uuid import UUID, uuid4

from pydantic import SecretStr, ValidationError

from agent_service.config import ActiveModelSettings
from agent_service.model_config_crypto import ModelConfigCipher, ModelConfigCryptoError
from agent_service.model_config_repository import (
    ActiveConfigPointer,
    CommitVerifiedActivation,
    ControlEvent,
    ModelConfigConflictError,
    ModelConfigNotFoundError,
    ModelConfigRepository,
    ModelConfigStorageError,
    ModelConfigValidationError,
    SaveSealedConfig,
    StoredActiveConfig,
    StoredSealedConfig,
)
from agent_service.model_config_types import (
    MODEL_PROVIDERS,
    ModelConfigDraft,
    ModelProvider,
    StoredModelConfigMetadata,
)
from agent_service.model_control_auth import ModelControlAssertion
from agent_service.model_endpoint_catalog import (
    EndpointNotAllowedError,
    EndpointOption,
    ModelEndpointCatalog,
)
from agent_service.model_registry import build_managed_model
from agent_service.model_runtime_slot import (
    ModelRuntimeSlot,
    RuntimeModelMetadata,
    RuntimeModelStatus,
)
from agent_service.model_runtime_types import ManagedModel
from agent_service.model_verifier import ModelVerificationResult, verify_model


class ModelControlServiceError(RuntimeError):
    """Base class for fixed, response-safe control service failures."""


class ModelControlValidationError(ModelControlServiceError):
    """One caller command failed strict domain validation."""


class ModelControlEndpointError(ModelControlServiceError):
    """One Endpoint ID is unavailable or belongs to another Provider."""


class ModelControlDisabledError(ModelControlServiceError):
    """The deployment kill switch keeps model configuration read-only."""


class ModelControlConflictError(ModelControlServiceError):
    """The requested current configuration or assertion is stale."""


class ModelControlStorageError(ModelControlServiceError):
    """Control persistence could not commit a safe result."""


class ModelControlEncryptionError(ModelControlServiceError):
    """Key encryption or authenticated decryption failed closed."""


class ModelControlProviderError(ModelControlServiceError):
    """Provider verification failed with one fixed public category."""


class ModelControlAssistantError(ModelControlServiceError):
    """The verified candidate could not become the serving model."""


def _disabled() -> NoReturn:
    raise ModelControlDisabledError("control_disabled") from None


def _endpoint_not_allowed() -> NoReturn:
    raise ModelControlEndpointError("endpoint_not_allowed") from None


def _validation_error() -> NoReturn:
    raise ModelControlValidationError("validation_error") from None


def _conflict() -> NoReturn:
    raise ModelControlConflictError("configuration_conflict") from None


def _storage_unavailable() -> NoReturn:
    raise ModelControlStorageError("storage_unavailable") from None


def _encryption_unavailable() -> NoReturn:
    raise ModelControlEncryptionError("encryption_unavailable") from None


def _provider_failure(category: str) -> NoReturn:
    if category not in {
        "credential_rejected",
        "model_not_found",
        "provider_unreachable",
        "provider_timeout",
    }:
        category = "provider_unreachable"
    raise ModelControlProviderError(category) from None


def _assistant_unavailable() -> NoReturn:
    raise ModelControlAssistantError("assistant_unavailable") from None


def _valid_assertion(
    assertion: object,
    *,
    action: str,
    provider: ModelProvider,
    permission: str,
) -> bool:
    return bool(
        type(assertion) is ModelControlAssertion
        and type(assertion.actor) is UUID
        and type(assertion.request_id) is UUID
        and type(assertion.nonce) is UUID
        and type(assertion.permission) is str
        and assertion.permission == permission
        and type(assertion.action) is str
        and assertion.action == action
        and type(assertion.provider) is str
        and assertion.provider == provider
        and type(assertion.issued_at) is int
        and type(assertion.expires_at) is int
        and assertion.issued_at < assertion.expires_at
    )


async def _finish_candidate_close(managed: ManagedModel) -> bool:
    """Complete one owned close despite cancellation, then re-propagate it."""
    close_task = asyncio.create_task(
        managed.aclose(),
        name="model-control-candidate-close",
    )
    cancellation_received = False
    close_failed = False
    while True:
        try:
            await asyncio.shield(close_task)
            break
        except asyncio.CancelledError:
            if close_task.cancelled():
                raise
            cancellation_received = True
        except Exception:
            close_failed = True
            break
    if cancellation_received:
        raise asyncio.CancelledError
    return not close_failed


async def _commit_activation_definitively(
    repository: ModelConfigRepository,
    command: CommitVerifiedActivation,
    event: ControlEvent,
) -> tuple[object | None, str | None, bool]:
    """Wait for one activation commit to reach a definite result under cancellation."""
    commit_task = asyncio.create_task(
        repository.commit_test_and_activation(command, event),
        name="model-control-activation-commit",
    )
    cancellation_received = False
    pointer: object | None = None
    failure: str | None = None
    while True:
        try:
            pointer = await asyncio.shield(commit_task)
            break
        except asyncio.CancelledError:
            cancellation_received = True
            if commit_task.cancelled():
                break
        except ModelConfigConflictError:
            failure = "conflict"
            break
        except (ModelConfigStorageError, ModelConfigValidationError):
            failure = "storage"
            break
        except Exception:
            failure = "storage"
            break
    return pointer, failure, cancellation_received


def _degrade_slot(slot: ModelRuntimeSlot) -> None:
    try:
        slot.deactivate(capability="degraded")
    except Exception:
        pass


def _valid_committed_pointer(
    pointer: object,
    *,
    stored: StoredSealedConfig,
    expected_activation_version: int,
) -> bool:
    return bool(
        type(pointer) is ActiveConfigPointer
        and pointer.config_id == stored.config_id
        and pointer.provider == stored.provider
        and pointer.config_revision == stored.revision
        and pointer.activation_version == expected_activation_version
    )


@dataclass(frozen=True, slots=True)
class DeploymentModelMetadata:
    """Safe read-only projection of the legacy deployment bootstrap."""

    provider: ModelProvider
    model_id: str
    read_only: bool = True


@dataclass(frozen=True, slots=True)
class ModelConfigListResult:
    """Safe data required to render the model configuration control panel."""

    configs: tuple[StoredModelConfigMetadata, ...]
    endpoints: tuple[EndpointOption, ...]
    bootstrap: DeploymentModelMetadata | None
    control_enabled: bool


class ModelControlService:
    """Coordinate safe configuration commands across control dependencies."""

    def __init__(
        self,
        *,
        repository: ModelConfigRepository,
        cipher: ModelConfigCipher,
        endpoint_catalog: ModelEndpointCatalog,
        slot: ModelRuntimeSlot,
        bootstrap_model: ActiveModelSettings | None,
        control_enabled: bool,
        uuid_factory: Callable[[], UUID] = uuid4,
        model_builder: Callable[[ActiveModelSettings], ManagedModel] = (
            build_managed_model
        ),
        verifier: Callable[..., Awaitable[ModelVerificationResult]] = verify_model,
        verification_timeout_seconds: int = 50,
    ) -> None:
        self._repository = repository
        self._cipher = cipher
        self._endpoint_catalog = endpoint_catalog
        self._slot = slot
        self._bootstrap_model = bootstrap_model
        self._control_enabled = control_enabled
        self._uuid_factory = uuid_factory
        self._model_builder = model_builder
        self._verifier = verifier
        self._verification_timeout_seconds = verification_timeout_seconds
        self._activation_lock = asyncio.Lock()

    async def list_model_configs(self) -> ModelConfigListResult:
        configs: tuple[StoredModelConfigMetadata, ...] | None = None
        try:
            configs = tuple(await self._repository.list_metadata())
        except Exception:
            pass
        if configs is None:
            _storage_unavailable()
        bootstrap = self._bootstrap_model
        return ModelConfigListResult(
            configs=configs,
            endpoints=self._endpoint_catalog.public_snapshot(),
            bootstrap=(
                None
                if bootstrap is None
                else DeploymentModelMetadata(
                    provider=bootstrap.provider,
                    model_id=bootstrap.model_id,
                )
            ),
            control_enabled=self._control_enabled,
        )

    async def save_model_config(
        self,
        draft: ModelConfigDraft,
        assertion: ModelControlAssertion,
    ) -> StoredModelConfigMetadata:
        if not self._control_enabled:
            _disabled()
        if type(draft) is not ModelConfigDraft or not _valid_assertion(
            assertion,
            action="save",
            provider=draft.provider,
            permission="admin:assistant:configure",
        ):
            _validation_error()
        validated_draft: ModelConfigDraft | None = None
        try:
            validated_draft = ModelConfigDraft.model_validate(
                {
                    "provider": draft.provider,
                    "model_id": draft.model_id,
                    "endpoint_id": draft.endpoint_id,
                    "api_key": draft.api_key,
                    "expected_revision": draft.expected_revision,
                }
            )
        except (AttributeError, TypeError, ValidationError):
            pass
        if validated_draft is None:
            _validation_error()
        draft = validated_draft
        endpoint_allowed = False
        try:
            self._endpoint_catalog.resolve(draft.endpoint_id, draft.provider)
            endpoint_allowed = True
        except EndpointNotAllowedError:
            pass
        except Exception:
            pass
        if not endpoint_allowed:
            _endpoint_not_allowed()
        config_id = self._uuid_factory()
        revision = draft.expected_revision + 1
        secret: SecretStr | None = draft.api_key
        if secret is None:
            current = None
            load_failure: str | None = None
            try:
                current = await self._repository.load_sealed(draft.provider)
            except (ModelConfigConflictError, ModelConfigNotFoundError):
                load_failure = "conflict"
            except ModelConfigStorageError:
                load_failure = "storage"
            except Exception:
                load_failure = "storage"
            if load_failure == "storage":
                _storage_unavailable()
            if load_failure == "conflict" or current is None:
                _conflict()
            if (
                type(current) is not StoredSealedConfig
                or current.provider != draft.provider
            ):
                _storage_unavailable()
            if current.revision != draft.expected_revision:
                _conflict()
            try:
                secret = self._cipher.open(
                    config_id=current.config_id,
                    provider=current.provider,
                    revision=current.revision,
                    sealed=current.sealed,
                )
            except ModelConfigCryptoError:
                pass
            except Exception:
                pass
            if secret is None:
                _encryption_unavailable()

        sealed = None
        try:
            sealed = self._cipher.seal(
                config_id=config_id,
                provider=draft.provider,
                revision=revision,
                secret=secret,
            )
        except ModelConfigCryptoError:
            pass
        except Exception:
            pass
        finally:
            secret = None
        if sealed is None:
            _encryption_unavailable()

        command: SaveSealedConfig | None = None
        event: ControlEvent | None = None
        try:
            command = SaveSealedConfig(
                config_id=config_id,
                provider=draft.provider,
                model_id=draft.model_id,
                endpoint_id=draft.endpoint_id,
                revision=revision,
                expected_revision=draft.expected_revision,
                sealed=sealed,
                assertion_nonce=assertion.nonce,
            )
            event = ControlEvent(
                event_id=self._uuid_factory(),
                request_id=assertion.request_id,
                assertion_nonce=assertion.nonce,
                actor_user_id=assertion.actor,
                action="model_config_saved",
                provider=draft.provider,
                model_id=draft.model_id,
                endpoint_id=draft.endpoint_id,
                config_revision=revision,
                result="success",
            )
        except ModelConfigValidationError:
            pass
        if command is None or event is None:
            _validation_error()

        result: StoredModelConfigMetadata | None = None
        repository_failure: str | None = None
        try:
            result = await self._repository.save_draft(command, event)
        except ModelConfigConflictError:
            repository_failure = "conflict"
        except ModelConfigValidationError:
            repository_failure = "validation"
        except ModelConfigStorageError:
            repository_failure = "storage"
        except Exception:
            repository_failure = "storage"
        if repository_failure == "conflict":
            _conflict()
        if repository_failure == "validation":
            _validation_error()
        if repository_failure == "storage" or result is None:
            _storage_unavailable()
        return result

    async def test_and_activate(
        self,
        provider: ModelProvider,
        revision: int,
        assertion: ModelControlAssertion,
    ) -> ActiveConfigPointer:
        if not self._control_enabled:
            _disabled()
        if (
            type(provider) is not str
            or provider not in MODEL_PROVIDERS
            or type(revision) is not int
            or revision < 1
            or not _valid_assertion(
                assertion,
                action="test_and_activate",
                provider=provider,
                permission="admin:assistant:configure",
            )
        ):
            _validation_error()

        stored = None
        load_failure: str | None = None
        try:
            stored = await self._repository.load_sealed(provider)
        except ModelConfigNotFoundError:
            load_failure = "conflict"
        except ModelConfigConflictError:
            load_failure = "conflict"
        except ModelConfigStorageError:
            load_failure = "storage"
        except Exception:
            load_failure = "storage"
        if load_failure == "storage":
            _storage_unavailable()
        if load_failure == "conflict" or stored is None:
            _conflict()
        if type(stored) is not StoredSealedConfig or stored.provider != provider:
            _storage_unavailable()
        if stored.revision != revision:
            _conflict()

        secret = None
        try:
            secret = self._cipher.open(
                config_id=stored.config_id,
                provider=stored.provider,
                revision=stored.revision,
                sealed=stored.sealed,
            )
        except ModelConfigCryptoError:
            pass
        except Exception:
            pass
        if secret is None:
            _encryption_unavailable()

        endpoint = None
        try:
            endpoint = self._endpoint_catalog.resolve(
                stored.endpoint_id,
                stored.provider,
            )
        except EndpointNotAllowedError:
            pass
        except Exception:
            pass
        if endpoint is None:
            secret = None
            _endpoint_not_allowed()

        managed: ManagedModel | None = None
        build_failed = False
        try:
            managed = self._model_builder(
                ActiveModelSettings(
                    provider=stored.provider,
                    model_id=stored.model_id,
                    api_key=secret,
                    base_url=endpoint.base_url,
                    timeout_seconds=self._verification_timeout_seconds,
                )
            )
        except Exception:
            build_failed = True
        finally:
            secret = None
        if build_failed or not isinstance(managed, ManagedModel):
            _assistant_unavailable()

        transferred = False
        outcome: ActiveConfigPointer | None = None
        failure: str | None = None
        cancellation_received = False
        close_succeeded = True
        try:
            verification: ModelVerificationResult | None = None
            try:
                verification = await self._verifier(
                    managed,
                    timeout_seconds=self._verification_timeout_seconds,
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                verification = ModelVerificationResult(
                    False,
                    "provider_unreachable",
                )

            exact_success = (
                type(verification) is ModelVerificationResult
                and type(verification.ok) is bool
                and verification.ok is True
                and verification.category == "success"
            )
            if not exact_success:
                category = "provider_unreachable"
                if (
                    type(verification) is ModelVerificationResult
                    and verification.ok is False
                    and verification.category
                    in {
                        "credential_rejected",
                        "model_not_found",
                        "provider_unreachable",
                        "provider_timeout",
                    }
                ):
                    category = verification.category
                event = ControlEvent(
                    event_id=self._uuid_factory(),
                    request_id=assertion.request_id,
                    assertion_nonce=assertion.nonce,
                    actor_user_id=assertion.actor,
                    action="model_config_tested",
                    provider=stored.provider,
                    model_id=stored.model_id,
                    endpoint_id=stored.endpoint_id,
                    config_revision=stored.revision,
                    result=category,
                )
                try:
                    await self._repository.record_failed_test(
                        stored.provider,
                        stored.revision,
                        event,
                    )
                except ModelConfigConflictError:
                    failure = "conflict"
                except ModelConfigStorageError:
                    failure = "storage"
                except Exception:
                    failure = "storage"
                if failure is None:
                    failure = category
            else:
                event = ControlEvent(
                    event_id=self._uuid_factory(),
                    request_id=assertion.request_id,
                    assertion_nonce=assertion.nonce,
                    actor_user_id=assertion.actor,
                    action="model_config_activated",
                    provider=stored.provider,
                    model_id=stored.model_id,
                    endpoint_id=stored.endpoint_id,
                    config_revision=stored.revision,
                    result="success",
                )
                async with self._activation_lock:
                    active: StoredActiveConfig | None = None
                    try:
                        active = await self._repository.load_active()
                    except ModelConfigConflictError:
                        failure = "conflict"
                    except ModelConfigStorageError:
                        failure = "storage"
                    except Exception:
                        failure = "storage"

                    if active is None:
                        expected_current_version = 0
                    elif type(active) is StoredActiveConfig:
                        expected_current_version = active.activation_version
                    else:
                        failure = "storage"
                        expected_current_version = 0
                    expected_next_version = expected_current_version + 1
                    committed: object | None = None
                    commit_result_observed = False
                    if failure is None:
                        try:
                            (
                                committed,
                                failure,
                                cancellation_received,
                            ) = await _commit_activation_definitively(
                                self._repository,
                                CommitVerifiedActivation(
                                    provider=stored.provider,
                                    config_revision=stored.revision,
                                    expected_activation_version=(
                                        expected_current_version
                                    ),
                                ),
                                event,
                            )
                            commit_result_observed = True
                        except asyncio.CancelledError:
                            raise
                        except Exception:
                            failure = "storage"

                    if commit_result_observed and failure == "storage":
                        _degrade_slot(self._slot)

                    pointer_is_valid = (
                        failure is None
                        and committed is not None
                        and _valid_committed_pointer(
                            committed,
                            stored=stored,
                            expected_activation_version=expected_next_version,
                        )
                    )
                    if failure is None and not pointer_is_valid:
                        _degrade_slot(self._slot)
                        failure = "assistant"
                    elif pointer_is_valid and type(committed) is ActiveConfigPointer:
                        outcome = committed
                        activated = False
                        try:
                            self._slot.activate(
                                managed,
                                committed.activation_version,
                                RuntimeModelMetadata(
                                    source="dynamic",
                                    provider=stored.provider,
                                    model_id=stored.model_id,
                                    config_revision=stored.revision,
                                ),
                            )
                            activated = True
                        except Exception:
                            pass
                        if activated:
                            transferred = True
                        else:
                            _degrade_slot(self._slot)
                            failure = "assistant"
        finally:
            if not transferred:
                close_succeeded = await _finish_candidate_close(managed)

        if cancellation_received:
            raise asyncio.CancelledError
        if not close_succeeded:
            _assistant_unavailable()
        if failure == "conflict":
            _conflict()
        if failure == "storage":
            _storage_unavailable()
        if failure == "assistant" or outcome is None and failure is None:
            _assistant_unavailable()
        if failure is not None:
            _provider_failure(failure)
        if outcome is None:
            _assistant_unavailable()
        return outcome

    async def reveal_key(
        self,
        provider: ModelProvider,
        revision: int,
        assertion: ModelControlAssertion,
    ) -> SecretStr:
        if not self._control_enabled:
            _disabled()
        if (
            type(provider) is not str
            or provider not in MODEL_PROVIDERS
            or type(revision) is not int
            or revision < 1
            or not _valid_assertion(
                assertion,
                action="reveal",
                provider=provider,
                permission="admin:assistant:secret:reveal",
            )
        ):
            _validation_error()

        stored = None
        load_failure: str | None = None
        try:
            stored = await self._repository.load_for_reveal(provider, revision)
        except (ModelConfigConflictError, ModelConfigNotFoundError):
            load_failure = "conflict"
        except ModelConfigStorageError:
            load_failure = "storage"
        except Exception:
            load_failure = "storage"
        if load_failure == "storage":
            _storage_unavailable()
        if load_failure == "conflict" or stored is None:
            _conflict()
        if (
            type(stored) is not StoredSealedConfig
            or stored.provider != provider
            or stored.revision != revision
        ):
            _storage_unavailable()

        plaintext: SecretStr | None = None
        try:
            decrypt_failed = False
            try:
                plaintext = self._cipher.open(
                    config_id=stored.config_id,
                    provider=stored.provider,
                    revision=stored.revision,
                    sealed=stored.sealed,
                )
            except ModelConfigCryptoError:
                decrypt_failed = True
            except Exception:
                decrypt_failed = True

            event: ControlEvent | None = None
            try:
                event = ControlEvent(
                    event_id=self._uuid_factory(),
                    request_id=assertion.request_id,
                    assertion_nonce=assertion.nonce,
                    actor_user_id=assertion.actor,
                    action="model_key_revealed",
                    provider=stored.provider,
                    model_id=stored.model_id,
                    endpoint_id=stored.endpoint_id,
                    config_revision=stored.revision,
                    result=("encryption_unavailable" if decrypt_failed else "success"),
                )
            except ModelConfigValidationError:
                pass
            if event is None:
                _validation_error()

            commit_failure: str | None = None
            commit_result: str | None = None
            try:
                if decrypt_failed:
                    await self._repository.commit_reveal_failure(
                        stored.provider,
                        stored.revision,
                        event,
                    )
                    commit_result = "committed"
                else:
                    commit_result = await self._repository.commit_reveal_success(
                        stored.provider,
                        stored.revision,
                        event,
                    )
            except ModelConfigConflictError:
                commit_failure = "conflict"
            except ModelConfigStorageError:
                commit_failure = "storage"
            except Exception:
                commit_failure = "storage"

            if commit_failure == "conflict":
                _conflict()
            if commit_failure == "storage" or commit_result is None:
                _storage_unavailable()
            if commit_result == "stale":
                _conflict()
            if type(commit_result) is not str or commit_result != "committed":
                _storage_unavailable()
            if decrypt_failed or plaintext is None:
                _encryption_unavailable()
            return plaintext
        finally:
            plaintext = None

    def runtime_status(self) -> RuntimeModelStatus:
        return self._slot.runtime_status()
