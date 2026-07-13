FROM python:3.13.13-slim-trixie@sha256:aa938a849bcb82dce8f49480f056ab82bf5c1c3ebc294f0430f37b6820e7f286 AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

RUN pip install --no-cache-dir uv==0.11.19

WORKDIR /app/apps/agent

COPY apps/agent/pyproject.toml ./pyproject.toml
COPY apps/agent/uv.lock ./uv.lock
RUN uv sync --frozen --no-dev --no-install-project

COPY apps/agent/src ./src
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.13.13-slim-trixie@sha256:aa938a849bcb82dce8f49480f056ab82bf5c1c3ebc294f0430f37b6820e7f286 AS runtime

ENV PATH=/app/.venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN groupadd --system --gid 10001 agent \
    && useradd --system --uid 10001 --gid agent --home-dir /nonexistent agent

WORKDIR /app

COPY --from=builder --chown=agent:agent /app/apps/agent/.venv /app/.venv

USER agent

EXPOSE 7777

CMD ["uvicorn", "agent_service.app:app_factory", "--factory", "--host", "0.0.0.0", "--port", "7777"]
