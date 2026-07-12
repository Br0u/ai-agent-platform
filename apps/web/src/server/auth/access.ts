import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { headers as nextHeaders } from "next/headers";

import {
  canEnterApplication,
  getDatabase,
  organizationMemberships,
  organizations,
  permissions,
  rolePermissions,
  roles,
  type IdentityRealm,
  type UserStatus,
  userRoles,
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
  organizationMembershipCount: number;
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
  "userId" | "organization" | "organizationMembershipCount"
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
  findCustomerOrganizations(userId: string): Promise<CustomerOrganization[]>;
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
  | "AUTH_PERMISSION_DENIED"
  | "AUTH_PASSWORD_CHANGE_REQUIRED"
  | "AUTH_TOTP_SETUP_REQUIRED"
  | "AUTH_ORGANIZATION_REQUIRED"
  | "AUTH_ORGANIZATION_AMBIGUOUS"
  | "AUTH_ORGANIZATION_NOT_ACTIVE";

const ACCESS_MESSAGES: Readonly<Record<AuthAccessErrorCode, string>> = {
  AUTH_SESSION_REQUIRED: "Authentication required",
  AUTH_REALM_MISMATCH: "This session cannot access this area",
  AUTH_ACCOUNT_DISABLED: "This account is disabled",
  AUTH_ACCOUNT_NOT_ACTIVE: "This account is not active",
  AUTH_PERMISSION_DENIED: "Permission denied",
  AUTH_PASSWORD_CHANGE_REQUIRED: "Password change required",
  AUTH_TOTP_SETUP_REQUIRED: "Two-factor setup required",
  AUTH_ORGANIZATION_REQUIRED: "An active organization is required",
  AUTH_ORGANIZATION_AMBIGUOUS: "Organization membership is ambiguous",
  AUTH_ORGANIZATION_NOT_ACTIVE: "This organization is not active",
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseAuthenticatedSession(
  value: unknown,
): AuthenticatedSession | null {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.session)) {
    return null;
  }

  const userId = value.user.id;
  const sessionUserId = value.session.userId;
  const realm = value.session.realm;
  if (
    typeof userId !== "string" ||
    userId.trim().length === 0 ||
    typeof sessionUserId !== "string" ||
    sessionUserId !== userId ||
    (realm !== "customer" && realm !== "workforce")
  ) {
    return null;
  }

  return { userId, realm };
}

type GetSession = (headers: Headers) => Promise<unknown>;

export function createSessionAuthenticator(
  getSession: GetSession,
): SessionAuthenticator {
  return async (requestHeaders) =>
    parseAuthenticatedSession(await getSession(requestHeaders));
}

function createDefaultAuthenticators(): Record<
  IdentityRealm,
  SessionAuthenticator
> {
  return {
    customer: createSessionAuthenticator((requestHeaders) =>
      getCustomerAuth().api.getSession({ headers: requestHeaders }),
    ),
    workforce: createSessionAuthenticator((requestHeaders) =>
      getStaffAuth().api.getSession({ headers: requestHeaders }),
    ),
  };
}

export function createDatabaseAccessRepository(
  database: ReturnType<typeof getDatabase> = getDatabase(),
): AccessRepository {
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

    async findCustomerOrganizations(userId) {
      return database
        .select({
          organizationId: organizations.id,
          legalName: organizations.legalName,
          status: organizations.status,
          role: organizationMemberships.role,
        })
        .from(organizationMemberships)
        .innerJoin(
          organizations,
          eq(organizationMemberships.organizationId, organizations.id),
        )
        .where(eq(organizationMemberships.userId, userId))
        .orderBy(
          asc(organizationMemberships.createdAt),
          asc(organizationMemberships.id),
        )
        .limit(2);
    },

    async findPermissionKeys(userId, realm) {
      const rows = await database
        .selectDistinct({ key: permissions.key })
        .from(userRoles)
        .innerJoin(
          roles,
          and(eq(userRoles.roleId, roles.id), eq(roles.realmScope, realm)),
        )
        .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
        .innerJoin(
          permissions,
          eq(rolePermissions.permissionId, permissions.id),
        )
        .where(eq(userRoles.userId, userId))
        .orderBy(asc(permissions.key));

      return rows.map(({ key }) => key);
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
      const currentOrganizations = await repository.findCustomerOrganizations(
        currentUser.id,
      );
      return {
        userId: currentUser.id,
        realm: "customer",
        status: currentUser.status,
        displayName: currentUser.displayName,
        emailVerificationStatus: currentUser.emailVerificationStatus,
        organization:
          currentOrganizations.length === 1 ? currentOrganizations[0] : null,
        organizationMembershipCount: currentOrganizations.length,
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
    if (actor.status === "active") {
      if (actor.organizationMembershipCount === 0) {
        throw new AuthAccessError("AUTH_ORGANIZATION_REQUIRED", 403);
      }
      if (actor.organizationMembershipCount > 1) {
        throw new AuthAccessError("AUTH_ORGANIZATION_AMBIGUOUS", 403);
      }
      if (!actor.organization || actor.organization.status !== "active") {
        throw new AuthAccessError("AUTH_ORGANIZATION_NOT_ACTIVE", 403);
      }
      return actor;
    }
    if (
      options?.onboardingAllowed &&
      canEnterApplication("customer", actor.status, "onboarding")
    ) {
      return actor;
    }
    throw new AuthAccessError("AUTH_ACCOUNT_NOT_ACTIVE", 403);
  }

  async function requireWorkforce(options?: {
    setupFlow?: "change-password" | "two-factor";
  }): Promise<WorkforceActor> {
    const actor = await getCurrentActor("workforce");
    if (!actor) throw new AuthAccessError("AUTH_SESSION_REQUIRED", 401);
    if (actor.realm !== "workforce") {
      throw new AuthAccessError("AUTH_REALM_MISMATCH", 403);
    }
    if (actor.mustChangePassword && options?.setupFlow !== "change-password") {
      throw new AuthAccessError("AUTH_PASSWORD_CHANGE_REQUIRED", 403);
    }
    if (
      !actor.mustChangePassword &&
      !actor.twoFactorEnabled &&
      options?.setupFlow !== "two-factor"
    ) {
      throw new AuthAccessError("AUTH_TOTP_SETUP_REQUIRED", 403);
    }
    return actor;
  }

  async function requirePermission(
    permission: PermissionKey,
  ): Promise<WorkforceActor> {
    // Read/page gate only. A security-sensitive mutation must repeat an exact
    // permission EXISTS check inside the same transaction as its writes; never
    // authorize a mutation from this actor's permission snapshot.
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

export async function requireWorkforce(options?: {
  setupFlow?: "change-password" | "two-factor";
}): Promise<WorkforceActor> {
  return createAccessService().requireWorkforce(options);
}

export async function requirePermission(
  permission: PermissionKey,
): Promise<WorkforceActor> {
  return createAccessService().requirePermission(permission);
}
