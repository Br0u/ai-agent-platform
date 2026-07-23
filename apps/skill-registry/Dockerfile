FROM python:3.13.13-slim-trixie@sha256:aa938a849bcb82dce8f49480f056ab82bf5c1c3ebc294f0430f37b6820e7f286 AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

RUN test "$(python --version)" = "Python 3.13.13" \
    && pip install --no-cache-dir uv==0.11.19

WORKDIR /app/apps/skill-registry

COPY packages/skill-core/pyproject.toml packages/skill-core/uv.lock /app/packages/skill-core/
COPY packages/skill-core/src /app/packages/skill-core/src
COPY apps/skill-registry/pyproject.toml apps/skill-registry/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY apps/skill-registry/src ./src
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.13.13-slim-trixie@sha256:aa938a849bcb82dce8f49480f056ab82bf5c1c3ebc294f0430f37b6820e7f286 AS runtime

ENV PATH=/app/apps/skill-registry/.venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN test "$(python --version)" = "Python 3.13.13" \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends gosu=1.17-3+b4 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10002 skill-registry \
    && useradd --system --uid 10002 --gid skill-registry --home-dir /nonexistent skill-registry \
    && install -d -o root -g root -m 0755 /etc/aap /opt/aap

WORKDIR /app/apps/skill-registry

COPY --from=builder --chown=skill-registry:skill-registry /app/apps/skill-registry/.venv /app/apps/skill-registry/.venv
COPY --chown=root:root --chmod=0644 infra/agent/skill-runtime-imports.json /etc/aap/skill-runtime-imports.json
COPY --chown=root:root --chmod=0755 infra/docker/run-with-secret-env.sh /opt/aap/run-with-secret-env.sh

USER skill-registry

EXPOSE 7788

CMD ["uvicorn", "skill_registry.app:app_factory", "--factory", "--host", "0.0.0.0", "--port", "7788", "--no-access-log"]
