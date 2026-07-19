"""Owned runtime model handles with deterministic asynchronous cleanup."""

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from agno.models.base import Model


class ManagedModelCloseError(RuntimeError):
    """Stable public failure for an owned model cleanup error."""


@dataclass(slots=True)
class ManagedModel:
    model: Model
    close_callback: Callable[[], Awaitable[None]] = field(repr=False)
    _close_lock: asyncio.Lock = field(
        init=False,
        repr=False,
        default_factory=asyncio.Lock,
    )
    _close_task: asyncio.Task[None] | None = field(
        init=False,
        repr=False,
        default=None,
    )

    def __post_init__(self) -> None:
        if not isinstance(self.model, Model):
            raise TypeError("model must be an Agno Model")
        if not callable(self.close_callback):
            raise TypeError("close_callback must be callable")

    async def _run_close(self) -> None:
        failed = False
        try:
            await self.close_callback()
        except BaseException:
            failed = True
        if failed:
            raise ManagedModelCloseError("managed model close failed")

    async def aclose(self) -> None:
        """Call close_callback at most once, including concurrent calls."""
        close_task = self._close_task
        if close_task is None:
            async with self._close_lock:
                close_task = self._close_task
                if close_task is None:
                    close_task = asyncio.create_task(self._run_close())
                    self._close_task = close_task
        await asyncio.shield(close_task)
