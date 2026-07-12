"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getDatabase,
  permissions,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "@ai-agent-platform/database";

import { requireConsolePage } from "../auth/workspace-route-guards";
import {
  requireSensitiveWorkforceAction,
  SensitiveActionError,
} from "../auth/sensitive-action";
import { AdminRoleError, createDefaultRolePermissionService } from "./roles";
import {
  AdminSessionError,
  createDefaultAdminSessionService,
  createDefaultCustomerSessionService,
} from "./sessions";
import {
  createDefaultWorkforceUserService,
  WorkforceMutationError,
  type WorkforceAdminActor,
} from "./users";

export type AdminActionState =
  | { kind: "idle" }
  | { kind: "success" }
  | { kind: "domain_error"; code: string };

type AdminReturnPath = "/admin/users" | "/admin/roles" | "/admin/site";

async function runAdminMutation(
  returnTo: AdminReturnPath,
  mutation: () => Promise<void>,
): Promise<AdminActionState> {
  try {
    await mutation();
    return { kind: "success" };
  } catch (error) {
    const authoritativeCode =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;
    if (
      error instanceof SensitiveActionError ||
      (error instanceof Error &&
        error.name === "SensitiveActionError" &&
        (error.message === "AUTH_REAUTH_REQUIRED" ||
          error.message === "AUTH_MFA_REQUIRED"))
    ) {
      redirect(`/staff/re-auth?returnTo=${encodeURIComponent(returnTo)}`);
      return { kind: "idle" };
    }
    if (
      error instanceof WorkforceMutationError ||
      error instanceof AdminRoleError ||
      error instanceof AdminSessionError
    ) {
      return { kind: "domain_error", code: error.code };
    }
    if (
      authoritativeCode === "AUTH_PERMISSION_DENIED" ||
      authoritativeCode === "AUTH_TOTP_SETUP_REQUIRED"
    ) {
      return { kind: "domain_error", code: authoritativeCode };
    }
    if (
      error instanceof Error &&
      (error.message.startsWith("ADMIN_INPUT_INVALID:") ||
        error.message === "AUTH_PERMISSION_DENIED" ||
        error.message === "SITE_CONFIGURATION_NOT_IMPLEMENTED")
    ) {
      return {
        kind: "domain_error",
        code: error.message.startsWith("ADMIN_INPUT_INVALID:")
          ? "ADMIN_INPUT_INVALID"
          : error.message,
      };
    }
    throw error;
  }
}

function required(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim())
    throw new Error(`ADMIN_INPUT_INVALID:${key}`);
  return value.trim();
}
const delegatedActor: WorkforceAdminActor = {
  userId: "guarded-by-service",
  role: "super_admin",
  permissions: [],
};

export async function createEmployeeAction(
  _previous: AdminActionState,
  formData: FormData,
) {
  return runAdminMutation("/admin/users", async () => {
    await createDefaultWorkforceUserService().createUser(delegatedActor, {
      name: required(formData, "name"),
      email: required(formData, "email"),
      username: required(formData, "username"),
      temporaryPassword: required(formData, "temporaryPassword"),
      initialRole: required(formData, "initialRole"),
    });
    revalidatePath("/admin/users");
  });
}
export async function disableUserAction(
  _previous: AdminActionState,
  formData: FormData,
) {
  return runAdminMutation("/admin/users", async () => {
    await createDefaultWorkforceUserService().disableUser(
      delegatedActor,
      required(formData, "userId"),
    );
    revalidatePath("/admin/users");
  });
}
export async function reactivateUserAction(
  _previous: AdminActionState,
  formData: FormData,
) {
  return runAdminMutation("/admin/users", async () => {
    await createDefaultWorkforceUserService().reactivateUser(
      delegatedActor,
      required(formData, "userId"),
    );
    revalidatePath("/admin/users");
  });
}
export async function replacePasswordAction(
  _previous: AdminActionState,
  formData: FormData,
) {
  return runAdminMutation("/admin/users", async () => {
    await createDefaultWorkforceUserService().replaceTemporaryPassword(
      delegatedActor,
      required(formData, "userId"),
      required(formData, "temporaryPassword"),
    );
    revalidatePath("/admin/users");
  });
}
export async function setUserRoleAction(
  _previous: AdminActionState,
  formData: FormData,
) {
  return runAdminMutation("/admin/roles", async () => {
    await createDefaultWorkforceUserService().setRole(
      delegatedActor,
      required(formData, "userId"),
      required(formData, "role"),
    );
    revalidatePath("/admin/roles");
  });
}
export async function addUserRoleAction(
  _previous: AdminActionState,
  formData: FormData,
) {
  return runAdminMutation("/admin/roles", async () => {
    await createDefaultWorkforceUserService().addRole(
      delegatedActor,
      required(formData, "userId"),
      required(formData, "role"),
    );
    revalidatePath("/admin/roles");
  });
}
export async function removeUserRoleAction(
  _previous: AdminActionState,
  formData: FormData,
) {
  return runAdminMutation("/admin/roles", async () => {
    await createDefaultWorkforceUserService().removeRole(
      delegatedActor,
      required(formData, "userId"),
      required(formData, "role"),
    );
    revalidatePath("/admin/roles");
  });
}
export async function replaceRolePermissionsAction(
  _previous: AdminActionState,
  formData: FormData,
) {
  return runAdminMutation("/admin/roles", async () => {
    await createDefaultRolePermissionService().replacePermissions(
      required(formData, "roleId"),
      required(formData, "permissionKeys")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    revalidatePath("/admin/roles");
  });
}
export async function revokeAdminSessionAction(
  _previous: AdminActionState,
  formData: FormData,
) {
  return runAdminMutation("/admin/users", async () => {
    await createDefaultAdminSessionService().revokeOne(
      required(formData, "userId"),
      required(formData, "realm") as "customer" | "workforce",
      required(formData, "sessionId"),
    );
    revalidatePath("/admin/users");
  });
}
export async function revokeAllAdminSessionsAction(
  _previous: AdminActionState,
  formData: FormData,
) {
  return runAdminMutation("/admin/users", async () => {
    await createDefaultAdminSessionService().revokeAll(
      required(formData, "userId"),
      required(formData, "realm") as "customer" | "workforce",
    );
    revalidatePath("/admin/users");
  });
}
export async function revokeCustomerSessionAction(formData: FormData) {
  const actor = await requireConsolePage();
  await createDefaultCustomerSessionService().revoke(
    actor.userId,
    required(formData, "sessionId"),
  );
  revalidatePath("/console/profile");
}

export async function updateSiteSettingsAction(
  _previous: AdminActionState,
  formData: FormData,
) {
  return runAdminMutation("/admin/site", async () => {
    const field = required(formData, "field");
    if (field !== "supportMessage")
      throw new Error("ADMIN_INPUT_INVALID:field");
    const actor = await requireSensitiveWorkforceAction("admin:site");
    const database = getDatabase();
    await database.transaction(async (tx) => {
      const authorized = await tx
        .select({ id: userRoles.id })
        .from(userRoles)
        .innerJoin(
          users,
          and(
            eq(users.id, userRoles.userId),
            eq(users.identityRealm, "workforce"),
            eq(users.status, "active"),
          ),
        )
        .innerJoin(
          roles,
          and(
            eq(roles.id, userRoles.roleId),
            eq(roles.realmScope, "workforce"),
          ),
        )
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .innerJoin(
          permissions,
          and(
            eq(permissions.id, rolePermissions.permissionId),
            eq(permissions.key, "admin:site"),
          ),
        )
        .where(eq(userRoles.userId, actor.userId))
        .limit(1);
      if (!authorized.length) throw new Error("AUTH_PERMISSION_DENIED");
      // Configuration storage belongs to the later CMS task. Keep this callable
      // boundary secure, but never claim a change that was not persisted.
      throw new Error("SITE_CONFIGURATION_NOT_IMPLEMENTED");
    });
  });
}
