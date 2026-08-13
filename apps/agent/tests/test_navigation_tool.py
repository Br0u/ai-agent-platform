from agent_service.navigation_tool import suggest_navigation


def test_suggest_navigation_returns_an_owned_non_executing_marker() -> None:
    assert suggest_navigation("/product/模型中心") == (
        "aap.navigate.v1:%2Fproduct%2F%E6%A8%A1%E5%9E%8B%E4%B8%AD%E5%BF%83"
    )
