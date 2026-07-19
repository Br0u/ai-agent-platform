"""Acceptance-only application factory with an offline deterministic model."""

import os
import re
import stat
from pathlib import Path
from uuid import UUID

from fastapi import FastAPI
from starlette.types import ASGIApp, Receive, Scope, Send

from agent_service.app import create_app
from e2e_agent.deterministic_model import build_acceptance_managed_model


_SESSION_DELETE_PATH = re.compile(
    r"^/sessions/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$"
)
_AUDIT_ERROR = "identity audit sink is invalid"


def _deleted_session_identity(method: str, path: str) -> str | None:
    if method != "DELETE":
        return None
    match = _SESSION_DELETE_PATH.fullmatch(path)
    if match is None:
        return None
    candidate = match.group(1)
    try:
        parsed = UUID(candidate)
    except ValueError:
        return None
    return candidate if str(parsed) == candidate else None


def _open_identity_audit_sink(audit_file: Path) -> int:
    flags = (
        os.O_WRONLY
        | os.O_APPEND
        | getattr(os, "O_NOFOLLOW", 0)
        | getattr(os, "O_NONBLOCK", 0)
    )
    created = False
    try:
        try:
            descriptor = os.open(
                audit_file,
                flags | os.O_CREAT | os.O_EXCL,
                0o600,
            )
            created = True
        except FileExistsError:
            descriptor = os.open(audit_file, flags)
    except OSError:
        raise RuntimeError(_AUDIT_ERROR) from None

    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise RuntimeError(_AUDIT_ERROR)
        if created:
            os.fchmod(descriptor, 0o600)
            metadata = os.fstat(descriptor)
        if stat.S_IMODE(metadata.st_mode) != 0o600:
            raise RuntimeError(_AUDIT_ERROR)
    except (OSError, RuntimeError):
        os.close(descriptor)
        raise RuntimeError(_AUDIT_ERROR) from None
    return descriptor


def audit_deleted_session_identity(
    *,
    method: str,
    path: str,
    audit_file: Path,
) -> bool:
    """Append a valid AgentOS session-delete identity without logging it."""
    identity = _deleted_session_identity(method, path)
    if identity is None:
        return False

    payload = f"{identity}\n".encode("ascii")
    descriptor = _open_identity_audit_sink(audit_file)
    try:
        if os.write(descriptor, payload) != len(payload):
            raise RuntimeError(_AUDIT_ERROR)
    except (OSError, RuntimeError):
        raise RuntimeError(_AUDIT_ERROR) from None
    finally:
        os.close(descriptor)
    return True


class SessionIdentityAuditMiddleware:
    """Acceptance-only audit sink for exact AgentOS session deletion routes."""

    def __init__(self, app: ASGIApp, *, audit_file: Path) -> None:
        self.app = app
        self.audit_file = audit_file

    async def __call__(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
    ) -> None:
        if scope["type"] == "http":
            method = scope.get("method")
            path = scope.get("path")
            if isinstance(method, str) and isinstance(path, str):
                audit_deleted_session_identity(
                    method=method,
                    path=path,
                    audit_file=self.audit_file,
                )
        await self.app(scope, receive, send)


def app_factory() -> FastAPI:
    """Uvicorn factory for deterministic container acceptance only."""
    audit_file = os.environ.get("AAP_SESSION_IDENTITY_AUDIT_FILE")
    if not audit_file:
        raise RuntimeError("acceptance identity audit file is required")
    app = create_app(model_builder=build_acceptance_managed_model)
    app.add_middleware(
        SessionIdentityAuditMiddleware,
        audit_file=Path(audit_file),
    )
    return app
