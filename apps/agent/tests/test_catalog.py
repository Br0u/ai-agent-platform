from agent_service.catalog import build_catalog
from agent_service.config import RuntimeSettings


DATABASE_URL = "postgresql+psycopg_async://runtime:password@db:5432/platform"


def test_catalog_is_explicitly_model_free_and_placeholder_only() -> None:
    settings = RuntimeSettings.model_validate(
        {
            "OS_SECURITY_KEY": "internal-key",
            "AGNO_DATABASE_URL": DATABASE_URL,
        }
    )

    catalog = build_catalog(settings)

    assert catalog.agents == []
    assert catalog.capability == "placeholder"
    assert not hasattr(catalog, "models")
    assert not hasattr(catalog, "teams")
    assert not hasattr(catalog, "workflows")
    assert not hasattr(catalog, "knowledge")
    assert not hasattr(catalog, "skills")
