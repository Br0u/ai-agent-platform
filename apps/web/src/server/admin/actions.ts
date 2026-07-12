"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  getDatabase,
  permissions,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "@ai-agent-platform/database";

import { requireConsolePage } from "../auth/workspace-route-guards";
import { requireSensitiveWorkforceAction } from "../auth/sensitive-action";
import { createDefaultRolePermissionService } from "./roles";
import {
  createDefaultAdminSessionService,
  createDefaultCustomerSessionService,
} from "./sessions";
import {
  createDefaultWorkforceUserService,
  type WorkforceAdminActor,
} from "./users";

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

export async function createEmployeeAction(formData: FormData) {
  await createDefaultWorkforceUserService().createUser(delegatedActor, {
    name: required(formData, "name"),
    email: required(formData, "email"),
    username: required(formData, "username"),
    temporaryPassword: required(formData, "temporaryPassword"),
    initialRole: required(formData, "initialRole"),
  });
  revalidatePath("/admin/users");
}
export async function disableUserAction(formData: FormData) {
  await createDefaultWorkforceUserService().disableUser(
    delegatedActor,
    required(formData, "userId"),
  );
  revalidatePath("/admin/users");
}
export async function reactivateUserAction(formData: FormData) {
  await createDefaultWorkforceUserService().reactivateUser(
    delegatedActor,
    required(formData, "userId"),
  );
  revalidatePath("/admin/users");
}
export async function replacePasswordAction(formData: FormData) {
  await createDefaultWorkforceUserService().replaceTemporaryPassword(
    delegatedActor,
    required(formData, "userId"),
    required(formData, "temporaryPassword"),
  );
  revalidatePath("/admin/users");
}
export async function setUserRoleAction(formData: FormData) {
  await createDefaultWorkforceUserService().setRole(
    delegatedActor,
    required(formData, "userId"),
    required(formData, "role"),
  );
  revalidatePath("/admin/roles");
}
export async function replaceRolePermissionsAction(formData: FormData) {
  await createDefaultRolePermissionService().replacePermissions(
    required(formData, "roleId"),
    required(formData, "permissionKeys")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  revalidatePath("/admin/roles");
}
export async function revokeAdminSessionAction(formData: FormData) {
  await createDefaultAdminSessionService().revokeOne(
    required(formData, "userId"),
    required(formData, "realm") as "customer" | "workforce",
    required(formData, "sessionId"),
  );
  revalidatePath("/admin/users");
}
export async function revokeAllAdminSessionsAction(formData: FormData) {
  await createDefaultAdminSessionService().revokeAll(
    required(formData, "userId"),
    required(formData, "realm") as "customer" | "workforce",
  );
  revalidatePath("/admin/users");
}
export async function revokeCustomerSessionAction(formData: FormData) {
  const actor = await requireConsolePage();
  await createDefaultCustomerSessionService().revoke(
    actor.userId,
    required(formData, "sessionId"),
  );
  revalidatePath("/console/profile");
}

export async function updateSiteSettingsAction(formData: FormData) {
  const field = required(formData, "field");
  if (field !== "supportMessage") throw new Error("ADMIN_INPUT_INVALID:field");
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
        and(eq(roles.id, userRoles.roleId), eq(roles.realmScope, "workforce")),
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
}
