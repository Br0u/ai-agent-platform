from dataclasses import FrozenInstanceError
from uuid import UUID, uuid4

import pytest

from skill_registry.types import (
    CreateSkillSet,
    PublishedRevisionOption,
    StoredSkillSet,
)


def test_skill_set_contracts_are_frozen_slotted_and_preserve_revision_order() -> None:
    first = uuid4()
    second = uuid4()
    command = CreateSkillSet(
        actor=uuid4(),
        request_id=uuid4(),
        assertion_nonce=uuid4(),
        agent_id="maduoduo",
        revision_ids=(second, first),
    )

    assert command.revision_ids == (second, first)
    assert not hasattr(command, "__dict__")
    with pytest.raises(FrozenInstanceError):
        command.agent_id = "other"  # type: ignore[assignment,misc]


def test_stored_skill_set_and_published_option_keep_exact_runtime_metadata() -> None:
    skill_id = uuid4()
    revision_id = uuid4()
    stored = StoredSkillSet(
        id=uuid4(),
        agent_id="maduoduo",
        state="candidate",
        revision_ids=(revision_id,),
        item_count=1,
        total_extracted_size=123,
        activation_version=None,
        failure_code=None,
    )
    option = PublishedRevisionOption(
        skill_id=skill_id,
        revision_id=revision_id,
        slug="demo",
        revision_no=2,
        artifact_sha256="a" * 64,
        extracted_size=123,
    )

    assert stored.revision_ids == (revision_id,)
    assert option.skill_id == skill_id
    assert option.revision_no == 2
    assert isinstance(option.revision_id, UUID)
