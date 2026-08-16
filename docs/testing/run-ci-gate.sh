#!/bin/sh

set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repo_root"

require_commands() {
  for command in "$@"; do
    command -v "$command" >/dev/null 2>&1 || {
      printf '%s\n' "$command is required for CI preflight" >&2
      exit 1
    }
  done
}

require_environment() {
  for name in "$@"; do
    eval "value=\${$name:-}"
    [ -n "$value" ] || {
      printf '%s\n' "$name is required for full CI preflight" >&2
      exit 1
    }
  done
}

require_full_environment() {
  require_commands docker node openssl pnpm psql sed uv
  require_environment \
    TEST_DATABASE_URL ROLE_BOUNDARY_DATABASE_URL \
    MIGRATOR_DATABASE_URL RUNTIME_DATABASE_URL BACKUP_DATABASE_URL \
    AGNO_MIGRATOR_DATABASE_URL AGNO_DATABASE_URL \
    AGENT_CONTROL_MIGRATOR_DATABASE_URL AGENT_CONTROL_DATABASE_URL \
    SKILL_REGISTRY_TEST_DATABASE_URL SKILL_REGISTRY_MIGRATOR_DATABASE_URL \
    SKILL_REGISTRY_DATABASE_URL SKILL_REGISTRY_RUNTIME_DATABASE_URL \
    SKILL_REGISTRY_CONTROL_KEY OS_SECURITY_KEY \
    ASSISTANT_RATE_LIMIT_SECRET BETTER_AUTH_SECRET BACKUP_ENCRYPTION_KEY_FILE \
    E2E_CUSTOMER_PASSWORD E2E_STAFF_PASSWORD E2E_ADMIN_PASSWORD \
    E2E_PENDING_CUSTOMER_SESSION_TOKEN E2E_DISABLED_CUSTOMER_SESSION_TOKEN \
    E2E_STAFF_SESSION_TOKEN E2E_ROLE_TARGET_SESSION_TOKEN \
    E2E_ADMIN_SESSION_TOKEN E2E_MODEL_ADMIN_SESSION_TOKEN \
    E2E_REVOKED_SESSION_TOKEN E2E_REPLACEMENT_PASSWORD
}

run_web_gate() {
  if [ -n "${TEST_DATABASE_URL:-}" ]; then
    DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @ai-agent-platform/database db:migrate
  fi
  pnpm --filter @ai-agent-platform/web test
  pnpm --filter @ai-agent-platform/document-content test
  pnpm --filter @ai-agent-platform/integrations test
  pnpm --filter @ai-agent-platform/ui test
  pnpm typecheck
  pnpm lint
  pnpm format:check
  node docs/testing/skill-runtime-e2e.test.ts
  pnpm build
}

run_agent_gate() {
  uv --directory apps/agent sync --frozen
  uv --directory apps/agent run pytest
  uv --directory apps/agent run ruff check .
  uv --directory apps/agent run mypy src tests
  docker build -t agent-service-ci -f apps/agent/Dockerfile .
  docker run --rm agent-service-ci uvicorn --version
  docker run --rm agent-service-ci python -c \
    "import importlib,json,pathlib; manifest=json.loads(pathlib.Path('/etc/aap/skill-runtime-imports.json').read_text()); assert manifest == {'version': 1, 'pythonModules': ['agno', 'cryptography', 'pydantic']}; [importlib.import_module(name) for name in manifest['pythonModules']]"
}

run_registry_image_smoke() {
  manager_url=$(printf '%s' "$SKILL_REGISTRY_DATABASE_URL" | sed 's/127\.0\.0\.1/host.docker.internal/')
  container=skill-registry-ci-smoke
  cleanup_registry_smoke() {
    docker rm -f "$container" >/dev/null 2>&1 || true
  }
  trap cleanup_registry_smoke EXIT INT TERM
  cleanup_registry_smoke
  docker build -t skill-registry-ci -f apps/skill-registry/Dockerfile .
  docker run -d --name "$container" --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=32m \
    --add-host host.docker.internal:host-gateway \
    -e SKILL_REGISTRY_DATABASE_URL="$manager_url" \
    -e SKILL_REGISTRY_CONTROL_KEY="$SKILL_REGISTRY_CONTROL_KEY" \
    -e SKILL_RUNTIME_IMPORTS_FILE=/etc/aap/skill-runtime-imports.json \
    skill-registry-ci >/dev/null
  ready=false
  attempt=1
  while [ "$attempt" -le 30 ]; do
    if docker exec "$container" python -c \
      "import json,urllib.request; response=urllib.request.urlopen('http://127.0.0.1:7788/internal/health/ready',timeout=2); payload=json.load(response); response.close(); assert payload == {'live': True, 'ready': True}" \
      >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
  [ "$ready" = true ] || {
    printf '%s\n' "Skill Registry readiness probe timed out after 30 attempts" >&2
    docker logs "$container"
    exit 1
  }
  docker exec "$container" sh -c 'test "$(id -u):$(id -g)" = 10002:10002'
  readonly_rootfs=$(docker inspect "$container" --format '{{.HostConfig.ReadonlyRootfs}}')
  port_bindings=$(docker inspect "$container" --format '{{json .HostConfig.PortBindings}}')
  [ "$readonly_rootfs" = true ] && { [ "$port_bindings" = null ] || [ "$port_bindings" = '{}' ]; } || {
    printf '%s\n' "Skill Registry smoke container security flags are invalid" >&2
    exit 1
  }
  cleanup_registry_smoke
  trap - EXIT INT TERM
}

run_registry_gate() {
  uv --directory packages/skill-core run pytest -q
  uv --directory packages/skill-core run ruff check .
  uv --directory packages/skill-core run mypy src tests
  uv --directory apps/skill-registry run pytest -q -rs
  uv --directory apps/skill-registry run ruff check .
  uv --directory apps/skill-registry run mypy src tests
  run_registry_image_smoke
  pnpm --filter @ai-agent-platform/web exec playwright install --with-deps chromium
  RUN_SKILL_RUNTIME_E2E=true \
    SKILL_RUNTIME_E2E_PROJECT=${SKILL_RUNTIME_E2E_PROJECT:-aap-skill-runtime-e2e-$$} \
    sh docs/testing/run-skill-runtime-e2e.sh
}

run_database_gate() {
  pnpm --filter @ai-agent-platform/database exec vitest run src/agno-role-boundary.integration.test.ts
  pnpm --filter @ai-agent-platform/database test
  pnpm restore:lifecycle:test
}

run_nginx_check() {
  network=aap-nginx-ci-${GITHUB_RUN_ID:-local}-$$
  upstream=aap-nginx-web-${GITHUB_RUN_ID:-local}-$$
  cleanup_nginx() {
    docker rm -f "$upstream" >/dev/null 2>&1 || true
    docker network rm "$network" >/dev/null 2>&1 || true
  }
  trap cleanup_nginx EXIT INT TERM
  docker network create "$network" >/dev/null
  docker run -d --name "$upstream" --network "$network" --network-alias web \
    nginx:1.28.3-alpine3.23 >/dev/null
  docker run --rm --network "$network" \
    -e PUBLIC_HOST=127.0.0.1 \
    -e ALLOW_LOCAL_VALIDATION_HOSTS=false \
    -v "$repo_root/infra/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
    -v "$repo_root/infra/nginx/default.conf.template:/etc/nginx/templates/default.conf.template:ro" \
    nginx:1.28.3-alpine3.23 nginx -t
  cleanup_nginx
  trap - EXIT INT TERM
}

run_deployment_gate() {
  docker build -t backup-service-ci -f infra/docker/backup.Dockerfile .
  docker run --rm --entrypoint gpg backup-service-ci --version
  pnpm --filter @ai-agent-platform/web test:assistant-startup
  DATABASE_URL="$MIGRATOR_DATABASE_URL" NODE_ENV=test pnpm --filter @ai-agent-platform/database db:seed-auth-e2e
  pnpm --filter @ai-agent-platform/web exec playwright install --with-deps chromium
  bash docs/testing/run-agentos-backup-restore.sh
  DATABASE_URL="$RUNTIME_DATABASE_URL" \
    pnpm --filter @ai-agent-platform/web exec playwright test e2e/auth-smoke.spec.ts
  docker build --target migrator -f apps/web/Dockerfile .
  docker build --target runner -f apps/web/Dockerfile .
  run_nginx_check
}

run_fast() {
  require_commands node pnpm uv
  run_web_gate
  uv --directory apps/agent run pytest -q
  uv --directory apps/agent run ruff check .
  uv --directory apps/agent run mypy src tests
  uv --directory packages/skill-core run pytest -q
  uv --directory packages/skill-core run ruff check .
  uv --directory packages/skill-core run mypy src tests
  uv --directory apps/skill-registry run pytest -q -rs
  uv --directory apps/skill-registry run ruff check .
  uv --directory apps/skill-registry run mypy src tests
  pnpm --filter @ai-agent-platform/database test
}

run_full() {
  require_full_environment
  run_web_gate
  run_agent_gate
  run_registry_gate
  run_database_gate
  run_deployment_gate
}

gate=${1:-}
case "$gate" in
  fast) run_fast ;;
  full) run_full ;;
  web) run_web_gate ;;
  agent) require_full_environment; run_agent_gate ;;
  registry) require_full_environment; run_registry_gate ;;
  database) require_full_environment; run_database_gate ;;
  deployment) require_full_environment; run_deployment_gate ;;
  nginx) require_commands docker; run_nginx_check ;;
  *)
    printf '%s\n' "usage: $0 fast|full|web|agent|registry|database|deployment|nginx" >&2
    exit 2
    ;;
esac
