import "server-only";

import { headers as nextHeaders } from "next/headers";

import {
  canEnterApplication,
  getDatabase,
  type IdentityRealm,
  type UserStatus,
} from "@ai-agent-platform/database";

import { getCustomerAuth } from "./customer-auth";
import { getStaffAuth } from "./staff-auth";

export type { IdentityRealm };
export type PermissionKey = string;

type EmailVerificationStatus = "unverified" | "pending" | "verified";
type OrganizationStatus = "pending_review" | "active" | "disabled" | "rejected";
type OrganizationRole = "owner" | "admin" | "member";

export type AuthoritativeUser = {
  id: string;
  realm: IdentityRealm;
  status: UserStatus;
  displayName: string;
  emailVerificationStatus: EmailVerificationStatus;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
};

export type CustomerOrganization = {
  organizationId: string;
  legalName: string;
  status: OrganizationStatus;
  role: OrganizationRole;
};

export type CustomerOrganizationDto = Omit<
  CustomerOrganization,
  "organizationId"
>;

type ActorBase = {
  userId: string;
  status: UserStatus;
  displayName: string;
};

export type CustomerActor = ActorBase & {
  realm: "customer";
  emailVerificationStatus: EmailVerificationStatus;
  organization: CustomerOrganization | null;
};

export type WorkforceActor = ActorBase & {
  realm: "workforce";
  status: "active";
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  permissions: PermissionKey[];
};

export type Actor = CustomerActor | WorkforceActor;

export type CustomerSessionDto = Omit<
  CustomerActor,
  "userId" | "organization"
> & {
  organization: CustomerOrganizationDto | null;
};
export type StaffSessionDto = Omit<WorkforceActor, "userId">;

export type AuthenticatedSession = {
  userId: string;
  realm: IdentityRealm;
};

export type SessionAuthenticator = (
  headers: Headers,
) => Promise<AuthenticatedSession | null>;

export type AccessRepository = {
  findUserById(userId: string): Promise<AuthoritativeUser | null>;
  findCustomerOrganization(
    userId: string,
  ): Promise<CustomerOrganization | null>;
  findPermissionKeys(
    userId: string,
    realm: IdentityRealm,
  ): Promise<PermissionKey[]>;
};

export type AuthAccessErrorCode =
  | "AUTH_SESSION_REQUIRED"
  | "AUTH_REALM_MISMATCH"
  | "AUTH_ACCOUNT_DISABLED"
  | "AUTH_ACCOUNT_NOT_ACTIVE"
  | "AUTH_PERMISSION_DENIED";

const ACCESS_MESSAGES: Readonly<Record<AuthAccessErrorCode, string>> = {
  AUTH_SESSION_REQUIRED: "Authentication required",
  AUTH_REALM_MISMATCH: "This session cannot access this area",
  AUTH_ACCOUNT_DISABLED: "This account is disabled",
  AUTH_ACCOUNT_NOT_ACTIVE: "This account is not active",
  AUTH_PERMISSION_DENIED: "Permission denied",
};

export class AuthAccessError extends Error {
  constructor(
    readonly code: AuthAccessErrorCode,
    readonly status: 401 | 403,
  ) {
    super(ACCESS_MESSAGES[code]);
    this.name = "AuthAccessError";
  }
}

export function authAccessErrorBody(error: AuthAccessError): {
  error: { code: AuthAccessErrorCode; message: string };
} {
  return {
    error: { code: error.code, message: ACCESS_MESSAGES[error.code] },
  };
}

export function roleIdsForRealm(
  roles: readonly {
    id: string;
    realmScope: IdentityRealm | "global";
  }[],
  realm: IdentityRealm,
): string[] {
  return roles
    .filter(({ realmScope }) => realmScope === realm)
    .map(({ id }) => id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAuthenticatedSession(
  value: unknown,
): AuthenticatedSession | null {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.session)) {
    return null;
  }

  const userId = value.user.id;
  const realm = value.session.realm;
  if (
    typeof userId !== "string" ||
    (realm !== "customer" && realm !== "workforce")
  ) {
    return null;
  }

  return { userId, realm };
}

function createDefaultAuthenticators(): Record<
  IdentityRealm,
  SessionAuthenticator
> {
  return {
    customer: async (requestHeaders) =>
      parseAuthenticatedSession(
        await getCustomerAuth().api.getSession({ headers: requestHeaders }),
      ),
    workforce: async (requestHeaders) =>
      parseAuthenticatedSession(
        await getStaffAuth().api.getSession({ headers: requestHeaders }),
      ),
  };
}

export function createDatabaseAccessRepository(): AccessRepository {
  const database = getDatabase();

  return {
    async findUserById(userId) {
      const found = await database.query.users.findFirst({
        where: (table, { eq }) => eq(table.id, userId),
        columns: {
          id: true,
          identityRealm: true,
          status: true,
          name: true,
          emailVerificationStatus: true,
          mustChangePassword: true,
          twoFactorEnabled: true,
        },
      });

      return found
        ? {
            id: found.id,
            realm: found.identityRealm,
            status: found.status,
            displayName: found.name,
            emailVerificationStatus: found.emailVerificationStatus,
            mustChangePassword: found.mustChangePassword,
            twoFactorEnabled: found.twoFactorEnabled,
          }
        : null;
    },

    async findCustomerOrganization(userId) {
      const membership = await database.query.organizationMemberships.findFirst(
        {
          where: (table, { eq }) => eq(table.userId, userId),
          columns: { organizationId: true, role: true },
        },
      );
      if (!membership) return null;

      const organization = await database.query.organizations.findFirst({
        where: (table, { eq }) => eq(table.id, membership.organizationId),
        columns: { id: true, legalName: true, status: true },
      });
      if (!organization) return null;

      return {
        organizationId: organization.id,
        legalName: organization.legalName,
        status: organization.status,
        role: membership.role,
      };
    },

    async findPermissionKeys(userId, realm) {
      const assignments = await database.query.userRoles.findMany({
        where: (table, { eq }) => eq(table.userId, userId),
        columns: { roleId: true },
      });
      const roleIds = assignments.map(({ roleId }) => roleId);
      if (roleIds.length === 0) return [];

      const currentRoles = await database.query.roles.findMany({
        where: (table, { inArray }) => inArray(table.id, roleIds),
        columns: { id: true, realmScope: true },
      });
      const currentRoleIds = roleIdsForRealm(currentRoles, realm);
      if (currentRoleIds.length === 0) return [];

      const grants = await database.query.rolePermissions.findMany({
        where: (table, { inArray }) => inArray(table.roleId, currentRoleIds),
        columns: { permissionId: true },
      });
      const permissionIds = grants.map(({ permissionId }) => permissionId);
      if (permissionIds.length === 0) return [];

      const currentPermissions = await database.query.permissions.findMany({
        where: (table, { inArray }) => inArray(table.id, permissionIds),
        columns: { key: true },
      });
      return currentPermissions.map(({ key }) => key);
    },
  };
}

type AccessServiceDependencies = {
  authenticators?: Record<IdentityRealm, SessionAuthenticator>;
  repository?: AccessRepository;
  getHeaders?: () => Promise<Headers>;
};

export function createAccessService(
  dependencies: AccessServiceDependencies = {},
) {
  const authenticators =
    dependencies.authenticators ?? createDefaultAuthenticators();
  const repository =
    dependencies.repository ?? createDatabaseAccessRepository();
  const getHeaders = dependencies.getHeaders ?? nextHeaders;

  async function getCurrentActor(realm: IdentityRealm): Promise<Actor | null> {
    const authenticated = await authenticators[realm](await getHeaders());
    if (!authenticated) return null;
    if (authenticated.realm !== realm) {
      throw new AuthAccessError("AUTH_REALM_MISMATCH", 403);
    }

    const currentUser = await repository.findUserById(authenticated.userId);
    if (!currentUser) {
      throw new AuthAccessError("AUTH_SESSION_REQUIRED", 401);
    }
    if (currentUser.realm !== realm) {
      throw new AuthAccessError("AUTH_REALM_MISMATCH", 403);
    }
    if (currentUser.status === "disabled") {
      throw new AuthAccessError("AUTH_ACCOUNT_DISABLED", 403);
    }

    if (realm === "customer") {
      return {
        userId: currentUser.id,
        realm: "customer",
        status: currentUser.status,
        displayName: currentUser.displayName,
        emailVerificationStatus: currentUser.emailVerificationStatus,
        organization: await repository.findCustomerOrganization(currentUser.id),
      };
    }

    if (currentUser.status !== "active") {
      throw new AuthAccessError("AUTH_ACCOUNT_NOT_ACTIVE", 403);
    }
    return {
      userId: currentUser.id,
      realm: "workforce",
      status: "active",
      displayName: currentUser.displayName,
      mustChangePassword: currentUser.mustChangePassword,
      twoFactorEnabled: currentUser.twoFactorEnabled,
      permissions: [
        ...new Set(
          await repository.findPermissionKeys(currentUser.id, "workforce"),
        ),
      ].sort(),
    };
  }

  async function requireCustomer(options?: {
    onboardingAllowed?: boolean;
  }): Promise<CustomerActor> {
    const actor = await getCurrentActor("customer");
    if (!actor) throw new AuthAccessError("AUTH_SESSION_REQUIRED", 401);
    if (actor.realm !== "customer") {
      throw new AuthAccessError("AUTH_REALM_MISMATCH", 403);
    }
    if (actor.status === "active") return actor;
    if (
      options?.onboardingAllowed &&
      canEnterApplication("customer", actor.status, "onboarding")
    ) {
      return actor;
    }
    throw new AuthAccessError("AUTH_ACCOUNT_NOT_ACTIVE", 403);
  }

  async function requireWorkforce(): Promise<WorkforceActor> {
    const actor = await getCurrentActor("workforce");
    if (!actor) throw new AuthAccessError("AUTH_SESSION_REQUIRED", 401);
    if (actor.realm !== "workforce") {
      throw new AuthAccessError("AUTH_REALM_MISMATCH", 403);
    }
    return actor;
  }

  async function requirePermission(
    permission: PermissionKey,
  ): Promise<WorkforceActor> {
    const actor = await requireWorkforce();
    if (!actor.permissions.includes(permission)) {
      throw new AuthAccessError("AUTH_PERMISSION_DENIED", 403);
    }
    return actor;
  }

  return {
    getCurrentActor,
    requireCustomer,
    requireWorkforce,
    requirePermission,
  };
}

export type AccessService = ReturnType<typeof createAccessService>;

export function toCustomerSessionDto(actor: CustomerActor): CustomerSessionDto {
  return {
    realm: "customer",
    status: actor.status,
    displayName: actor.displayName,
    emailVerificationStatus: actor.emailVerificationStatus,
    organization: actor.organization
      ? {
          legalName: actor.organization.legalName,
          status: actor.organization.status,
          role: actor.organization.role,
        }
      : null,
  };
}

export function toStaffSessionDto(actor: WorkforceActor): StaffSessionDto {
  return {
    realm: "workforce",
    status: "active",
    displayName: actor.displayName,
    mustChangePassword: actor.mustChangePassword,
    twoFactorEnabled: actor.twoFactorEnabled,
    permissions: [...new Set(actor.permissions)].sort(),
  };
}

export async function getCurrentActor(
  realm: IdentityRealm,
): Promise<Actor | null> {
  return createAccessService().getCurrentActor(realm);
}

export async function requireCustomer(options?: {
  onboardingAllowed?: boolean;
}): Promise<CustomerActor> {
  return createAccessService().requireCustomer(options);
}

export async function requireWorkforce(): Promise<WorkforceActor> {
  return createAccessService().requireWorkforce();
}

export async function requirePermission(
  permission: PermissionKey,
): Promise<WorkforceActor> {
  return createAccessService().requirePermission(permission);
}
