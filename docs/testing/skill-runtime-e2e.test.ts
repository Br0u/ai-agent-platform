const assert = require("node:assert/strict");
const { readFileSync, statSync } = require("node:fs");

const read = (file) => readFileSync(file, "utf8");

const dockerfile = read("apps/agent/Dockerfile");
const acceptance = dockerfile.indexOf("FROM runtime-base AS acceptance");
const acceptanceCopy = dockerfile.indexOf("apps/agent/tests/e2e_skill_runtime");
const runtime = dockerfile.indexOf("FROM runtime-base AS runtime");
assert(
  acceptance >= 0 && acceptanceCopy > acceptance && runtime > acceptanceCopy,
);
assert.equal(
  dockerfile.slice(runtime).includes("e2e_skill_runtime"),
  false,
  "production Agent image must not contain the acceptance composition root",
);

const overlay = read("compose.skill-runtime-e2e.yaml");
assert.match(overlay, /target:\s+acceptance/u);
assert.match(overlay, /e2e_skill_runtime\.app:app_factory/u);
assert.doesNotMatch(
  read("compose.yaml"),
  /e2e_skill_runtime|acceptance\/skill-runtime/u,
);
assert.doesNotMatch(
  read("apps/agent/src/agent_service/app.py"),
  /e2e_skill_runtime|acceptance\/skill-runtime/u,
);

const runner = read("docs/testing/run-skill-runtime-e2e.sh");
assert.match(runner, /RUN_SKILL_RUNTIME_E2E/u);
assert.match(runner, /aap-skill-runtime-e2e-/u);
assert.equal(
  statSync("docs/testing/run-skill-runtime-e2e.sh").mode & 0o111,
  0o111,
);

const sharedRunner = read("docs/testing/run-skill-registry-e2e.sh");
for (const evidence of [
  "@runtime-activate",
  "@runtime-empty",
  "@runtime-reenable",
  "assert_skill_runtime_stream marker",
  "assert_skill_runtime_stream empty",
  "RESTORE_EXPECTED_SKILL_ACTIVE_SET_ID",
  "Skill Registry E2E failed during: %s",
  "failure_stage=registry-restart-acceptance",
  "failure_stage=agent-restart-persistence",
  "agent_session_count()",
  "sessions_before_runtime=$(agent_session_count)",
  "sessions_after_runtime=$(agent_session_count)",
  'Skill runtime changed persisted Agent sessions: before=%s after=%s',
  "PNPM_REGISTRY=${PNPM_REGISTRY:-https://registry.npmjs.org}",
]) {
  assert(
    sharedRunner.includes(evidence),
    `missing runtime evidence: ${evidence}`,
  );
}
assert(
  sharedRunner.indexOf("sessions_before_runtime=$(agent_session_count)") <
    sharedRunner.indexOf("run_skill_registry_playwright @runtime-activate"),
  "Skill runtime session count must be captured before activation/run",
);
assert(
  sharedRunner.indexOf("sessions_after_runtime=$(agent_session_count)") >
    sharedRunner.indexOf("assert_skill_runtime_stream marker"),
  "Skill runtime session count must be captured after the terminal marker",
);

const skill = read("docs/testing/fixtures/skills/deterministic/SKILL.md");
const marker = read(
  "docs/testing/fixtures/skills/deterministic/references/marker.md",
);
assert.match(skill, /name:\s+deterministic-runtime/u);
assert.match(marker, /AAP_SKILL_RUNTIME_E2E_MARKER_v1/u);

const faults = read("apps/agent/tests/e2e_skill_runtime/faults.py");
for (const mode of ["response_lost", "not_committed", "unreachable"]) {
  assert(faults.includes(mode), `missing acceptance fault: ${mode}`);
}

console.log("Skill runtime E2E static contract passed.");
