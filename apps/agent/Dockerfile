FROM python:3.13.13-slim-trixie@sha256:aa938a849bcb82dce8f49480f056ab82bf5c1c3ebc294f0430f37b6820e7f286 AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

RUN pip install --no-cache-dir uv==0.11.19

WORKDIR /app/apps/agent

COPY apps/agent/pyproject.toml ./pyproject.toml
COPY apps/agent/uv.lock ./uv.lock
COPY packages/skill-core /app/packages/skill-core
RUN uv sync --frozen --no-dev --no-install-project

COPY apps/agent/src ./src
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.13.13-slim-trixie@sha256:aa938a849bcb82dce8f49480f056ab82bf5c1c3ebc294f0430f37b6820e7f286 AS runtime-base

ENV PATH=/app/apps/agent/.venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends gosu=1.17-3+b4 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 agent \
    && useradd --system --uid 10001 --gid agent --home-dir /nonexistent agent

WORKDIR /app/apps/agent

COPY --from=builder --chown=agent:agent /app/apps/agent/.venv /app/apps/agent/.venv
RUN install -d -o root -g root -m 0755 /etc/aap
COPY --chown=root:root --chmod=0644 infra/agent/model-endpoints.json /etc/aap/model-endpoints.json
COPY --chown=root:root --chmod=0644 infra/agent/skill-runtime-imports.json /etc/aap/skill-runtime-imports.json

FROM runtime-base AS acceptance

COPY --chown=agent:agent apps/agent/tests/e2e_agent /app/apps/agent/e2e_agent
COPY --chown=agent:agent apps/agent/tests/e2e_skill_runtime /app/apps/agent/e2e_skill_runtime

USER agent

EXPOSE 7777

CMD ["uvicorn", "e2e_agent.app:app_factory", "--factory", "--host", "0.0.0.0", "--port", "7777", "--no-access-log"]

FROM runtime-base AS runtime

USER agent

EXPOSE 7777

CMD ["uvicorn", "agent_service.app:app_factory", "--factory", "--host", "0.0.0.0", "--port", "7777", "--no-access-log"]
