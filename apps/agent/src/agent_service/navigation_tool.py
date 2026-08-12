"""Owned, non-executing navigation suggestion tool."""

from urllib.parse import quote


def suggest_navigation(pathname: str) -> str:
    return f"aap.navigate.v1:{quote(pathname, safe="~()*!.'-")}"  # noqa: Q000
