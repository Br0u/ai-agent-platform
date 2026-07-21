import type {
  AdminSkillFindingCode,
  AdminSkillRevisionDetailResponse,
} from "@/features/assistant/admin-skill-contract";

const REGISTRY_APPROVAL_BLOCKING_CODES = new Set<AdminSkillFindingCode>([
  "unsupported_import",
  "private_key",
]);

export function registryApprovalBlockingFindings(
  findings: AdminSkillRevisionDetailResponse["findings"],
): AdminSkillRevisionDetailResponse["findings"] {
  return findings.filter(
    (finding) =>
      finding.blocking || REGISTRY_APPROVAL_BLOCKING_CODES.has(finding.code),
  );
}
