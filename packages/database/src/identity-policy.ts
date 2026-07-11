export type IdentityRealm = "customer" | "workforce";
export type UserStatus = "pending_review" | "active" | "disabled" | "rejected";
export type Application = "onboarding" | "console";

const allowedTransitions: Readonly<Record<UserStatus, readonly UserStatus[]>> =
  {
    pending_review: ["active", "rejected"],
    active: ["disabled"],
    disabled: ["active"],
    rejected: [],
  };

export function canAssignRole(
  userRealm: IdentityRealm,
  roleRealm: IdentityRealm,
): boolean {
  return userRealm === roleRealm;
}

export function canEnterApplication(
  status: UserStatus,
  application: Application,
): boolean {
  return (
    ((status === "pending_review" || status === "rejected") &&
      application === "onboarding") ||
    (status === "active" && application === "console")
  );
}

export function canTransition(from: UserStatus, to: UserStatus): boolean {
  return allowedTransitions[from].includes(to);
}
