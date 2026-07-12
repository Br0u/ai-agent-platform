import "server-only";

import {
  normalizeIdentityEmail,
  organizationValuesFromLegalName,
} from "@ai-agent-platform/database";

import { matchesPostgresConstraint } from "./database-errors";

export type PublicRegistrationStatus = "pending_review" | "active" | "rejected";
export type DatabaseRegistrationStatus =
  | "pending_review"
  | "approved"
  | "rejected";

export function mapPublicRegistrationStatus(
  status: PublicRegistrationStatus,
): DatabaseRegistrationStatus {
  switch (status) {
    case "pending_review":
      return "pending_review";
    case "active":
      return "approved";
    case "rejected":
      return "rejected";
    default:
      throw new Error(
        `Unsupported public registration status: ${String(status)}`,
      );
  }
}

export function mapDatabaseRegistrationStatus(
  status: string,
): PublicRegistrationStatus {
  switch (status) {
    case "pending_review":
      return "pending_review";
    case "approved":
      return "active";
    case "rejected":
      return "rejected";
    default:
      throw new Error(`Unsupported registration status: ${status}`);
  }
}

export type OrganizationDecision =
  | { kind: "create"; legalName: string }
  | { kind: "link"; organizationId: string };

export type CustomerRole = "customer_admin" | "customer_member";

export type ReviewDecision = {
  requestId: string;
  organization: OrganizationDecision;
  initialRole?: CustomerRole;
  reviewNote?: string;
};

export type RegistrationQuery = {
  status: PublicRegistrationStatus;
  page: number;
  pageSize: 10 | 20 | 50;
};

export type RegistrationListItemDto = {
  id: string;
  applicantName: string;
  email: string;
  companyName: string;
  status: PublicRegistrationStatus;
  createdAt: string;
};

export type RegistrationPageDto = {
  items: RegistrationListItemDto[];
  total: number;
  page: number;
  pageSize: 10 | 20 | 50;
};

export type RegistrationStatusDto = {
  status: PublicRegistrationStatus;
};

export type SubmitRegistrationInput = {
  applicantName: string;
  email: string;
  password: string;
  companyName: string;
  acceptedTerms: boolean;
};

export type RegistrationContext = {
  ipAddress?: string;
  userAgent?: string;
};

export type PendingCustomerCredential = {
  applicantName: string;
  email: string;
  passwordHash: string;
  realm: "customer";
  status: "pending_review";
};

export type NewRegistrationRequest = {
  userId: string;
  companyName: string;
};

export type RegistrationAuditEvent =
  | {
      event: "registration.submitted";
      actor: { realm: "customer"; userId: string };
      target: { type: "registration"; id: string };
      metadata: { source: "self_service" };
      ipAddress?: string;
      userAgent?: string;
    }
  | {
      event: "registration.approved";
      actor: { realm: "workforce"; userId: string };
      target: { type: "registration"; id: string };
      metadata: { role: CustomerRole };
      ipAddress?: string;
      userAgent?: string;
    }
  | {
      event: "registration.rejected";
      actor: { realm: "workforce"; userId: string };
      target: { type: "registration"; id: string };
      metadata: { category: "other" };
      ipAddress?: string;
      userAgent?: string;
    };

export type LockedRegistration = {
  id: string;
  userId: string;
  status: string;
};

export interface RegistrationTransaction {
  createUserAndCredential(input: PendingCustomerCredential): Promise<string>;
  createRequest(input: NewRegistrationRequest): Promise<string>;
  appendAudit(event: RegistrationAuditEvent): Promise<void>;
  assertActiveWorkforcePermission(
    userId: string,
    permission: "admin:registrations",
  ): Promise<void>;
  lockRequest(requestId: string): Promise<LockedRegistration | null>;
  createOrFindOrganization(input: {
    legalName: string;
    legalNameKey: string;
  }): Promise<{ id: string; memberCount: number } | null>;
  findActiveOrganization(
    organizationId: string,
  ): Promise<{ id: string; memberCount: number } | null>;
  findCustomerRole(role: CustomerRole): Promise<string>;
  addMembershipAndRole(input: {
    organizationId: string;
    userId: string;
    reviewerUserId: string;
    membershipRole: "admin" | "member";
    roleId: string;
  }): Promise<void>;
  approveRequestAndActivateUser(input: {
    requestId: string;
    userId: string;
    organizationId: string;
    reviewerUserId: string;
    reviewNote?: string;
  }): Promise<boolean>;
  rejectRequestAndUser(input: {
    requestId: string;
    userId: string;
    reviewerUserId: string;
    reviewNote: string;
  }): Promise<boolean>;
}

export interface RegistrationRepository {
  transaction<T>(work: (tx: RegistrationTransaction) => Promise<T>): Promise<T>;
  list(
    query: RegistrationQuery,
    actorUserId: string,
  ): Promise<{
    items: RegistrationListItemDto[];
    total: number;
  }>;
  getStatusForCustomer(userId: string): Promise<RegistrationStatusDto | null>;
}

export type RegistrationRateLimiter = {
  consume(input: { identifier: string; ipAddress?: string }): Promise<void>;
};

export type RegistrationErrorCode =
  | "REGISTRATION_VALIDATION_FAILED"
  | "REGISTRATION_NOT_ACCEPTED"
  | "REGISTRATION_SUBMISSION_FAILED"
  | "REGISTRATION_RATE_LIMITED"
  | "REGISTRATION_ALREADY_REVIEWED"
  | "REGISTRATION_NOT_FOUND"
  | "REGISTRATION_ORGANIZATION_INVALID"
  | "REGISTRATION_PERMISSION_DENIED"
  | "REGISTRATION_REVIEW_FAILED";

export class RegistrationError extends Error {
  constructor(
    readonly code: RegistrationErrorCode,
    readonly field?: string,
  ) {
    super(code);
    this.name = "RegistrationError";
  }
}

export function isReservedRegistrationCompanyName(value: string): boolean {
  return value.normalize("NFKC").trim().toLowerCase().startsWith("__aap_");
}

export type RegistrationActor = {
  userId: string;
  realm: "workforce";
  status: "active";
  permissions: string[];
};

function requestContext(context: RegistrationContext) {
  return {
    ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
    ...(context.userAgent ? { userAgent: context.userAgent } : {}),
  };
}

function validateSubmission(input: SubmitRegistrationInput) {
  const applicantName = input.applicantName.normalize("NFKC").trim();
  const email = normalizeIdentityEmail(input.email);
  const companyName = input.companyName
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ");
  if (!applicantName || applicantName.length > 120)
    throw new RegistrationError(
      "REGISTRATION_VALIDATION_FAILED",
      "applicantName",
    );
  if (!email || email.length > 320 || !email.includes("@"))
    throw new RegistrationError("REGISTRATION_VALIDATION_FAILED", "email");
  if (input.password.length < 12 || input.password.length > 128)
    throw new RegistrationError("REGISTRATION_VALIDATION_FAILED", "password");
  if (
    !companyName ||
    companyName.length > 240 ||
    isReservedRegistrationCompanyName(companyName)
  )
    throw new RegistrationError(
      "REGISTRATION_VALIDATION_FAILED",
      "companyName",
    );
  if (input.acceptedTerms !== true)
    throw new RegistrationError(
      "REGISTRATION_VALIDATION_FAILED",
      "acceptedTerms",
    );
  return { applicantName, email, companyName, password: input.password };
}

function assertReadPermission(actor: RegistrationActor) {
  if (
    actor.realm !== "workforce" ||
    actor.status !== "active" ||
    !actor.permissions.includes("admin:registrations")
  ) {
    throw new RegistrationError("REGISTRATION_PERMISSION_DENIED");
  }
}

function normalizedReviewNote(value: string | undefined): string | undefined {
  const note = value?.trim();
  if (!note) return undefined;
  if (note.length > 2000)
    throw new RegistrationError("REGISTRATION_VALIDATION_FAILED", "reviewNote");
  return note;
}

export function createRegistrationService(dependencies: {
  repository: RegistrationRepository;
  limiter: RegistrationRateLimiter;
  hashPassword(password: string): Promise<string>;
}) {
  async function submitRegistration(
    rawInput: SubmitRegistrationInput,
    context: RegistrationContext,
  ) {
    const input = validateSubmission(rawInput);
    await dependencies.limiter.consume({
      identifier: input.email,
      ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
    });
    const passwordHash = await dependencies.hashPassword(input.password);

    try {
      return await dependencies.repository.transaction(async (tx) => {
        const userId = await tx.createUserAndCredential({
          applicantName: input.applicantName,
          email: input.email,
          passwordHash,
          realm: "customer",
          status: "pending_review",
        });
        const requestId = await tx.createRequest({
          userId,
          companyName: input.companyName,
        });
        await tx.appendAudit({
          event: "registration.submitted",
          actor: { realm: "customer", userId },
          target: { type: "registration", id: requestId },
          metadata: { source: "self_service" },
          ...requestContext(context),
        });
        return { requestId, userId, email: input.email };
      });
    } catch (error) {
      if (
        matchesPostgresConstraint(error, "23505", ["users_email_lower_unique"])
      )
        throw new RegistrationError("REGISTRATION_NOT_ACCEPTED");
      throw error;
    }
  }

  async function approveRegistration(
    decision: ReviewDecision,
    actor: RegistrationActor,
    context: RegistrationContext = {},
  ): Promise<void> {
    assertReadPermission(actor);
    const reviewNote = normalizedReviewNote(decision.reviewNote);
    await dependencies.repository.transaction(async (tx) => {
      await tx.assertActiveWorkforcePermission(
        actor.userId,
        "admin:registrations",
      );
      const request = await tx.lockRequest(decision.requestId);
      if (!request) throw new RegistrationError("REGISTRATION_NOT_FOUND");
      if (request.status !== "pending_review")
        throw new RegistrationError("REGISTRATION_ALREADY_REVIEWED");

      const organization =
        decision.organization.kind === "create"
          ? await tx.createOrFindOrganization(
              organizationValuesFromLegalName(decision.organization.legalName),
            )
          : await tx.findActiveOrganization(
              decision.organization.organizationId,
            );
      if (!organization)
        throw new RegistrationError("REGISTRATION_ORGANIZATION_INVALID");

      const role: CustomerRole =
        organization.memberCount === 0
          ? "customer_admin"
          : (decision.initialRole ?? "customer_member");
      const roleId = await tx.findCustomerRole(role);
      await tx.addMembershipAndRole({
        organizationId: organization.id,
        userId: request.userId,
        reviewerUserId: actor.userId,
        membershipRole: role === "customer_admin" ? "admin" : "member",
        roleId,
      });
      const updated = await tx.approveRequestAndActivateUser({
        requestId: request.id,
        userId: request.userId,
        organizationId: organization.id,
        reviewerUserId: actor.userId,
        ...(reviewNote ? { reviewNote } : {}),
      });
      if (!updated)
        throw new RegistrationError("REGISTRATION_ALREADY_REVIEWED");
      await tx.appendAudit({
        event: "registration.approved",
        actor: { realm: "workforce", userId: actor.userId },
        target: { type: "registration", id: request.id },
        metadata: { role },
        ...requestContext(context),
      });
    });
  }

  async function rejectRegistration(
    requestId: string,
    actor: RegistrationActor,
    reviewNote: string,
    context: RegistrationContext = {},
  ): Promise<void> {
    assertReadPermission(actor);
    const note = normalizedReviewNote(reviewNote);
    if (!note)
      throw new RegistrationError(
        "REGISTRATION_VALIDATION_FAILED",
        "reviewNote",
      );
    await dependencies.repository.transaction(async (tx) => {
      await tx.assertActiveWorkforcePermission(
        actor.userId,
        "admin:registrations",
      );
      const request = await tx.lockRequest(requestId);
      if (!request) throw new RegistrationError("REGISTRATION_NOT_FOUND");
      if (request.status !== "pending_review")
        throw new RegistrationError("REGISTRATION_ALREADY_REVIEWED");
      const updated = await tx.rejectRequestAndUser({
        requestId,
        userId: request.userId,
        reviewerUserId: actor.userId,
        reviewNote: note,
      });
      if (!updated)
        throw new RegistrationError("REGISTRATION_ALREADY_REVIEWED");
      await tx.appendAudit({
        event: "registration.rejected",
        actor: { realm: "workforce", userId: actor.userId },
        target: { type: "registration", id: request.id },
        metadata: { category: "other" },
        ...requestContext(context),
      });
    });
  }

  async function listRegistrationRequests(
    query: RegistrationQuery,
    actor: RegistrationActor,
  ): Promise<RegistrationPageDto> {
    assertReadPermission(actor);
    if (!Number.isSafeInteger(query.page) || query.page < 1)
      throw new RegistrationError("REGISTRATION_VALIDATION_FAILED", "page");
    if (![10, 20, 50].includes(query.pageSize))
      throw new RegistrationError("REGISTRATION_VALIDATION_FAILED", "pageSize");
    if (
      !(["pending_review", "active", "rejected"] as string[]).includes(
        query.status,
      )
    )
      throw new RegistrationError("REGISTRATION_VALIDATION_FAILED", "status");
    const result = await dependencies.repository.list(query, actor.userId);
    return { ...result, page: query.page, pageSize: query.pageSize };
  }

  async function getRegistrationStatus(actor: {
    userId: string;
    realm: "customer";
  }): Promise<RegistrationStatusDto> {
    if (actor.realm !== "customer")
      throw new RegistrationError("REGISTRATION_PERMISSION_DENIED");
    const result = await dependencies.repository.getStatusForCustomer(
      actor.userId,
    );
    if (!result) throw new RegistrationError("REGISTRATION_NOT_FOUND");
    return result;
  }

  return {
    submitRegistration,
    listRegistrationRequests,
    approveRegistration,
    rejectRegistration,
    getRegistrationStatus,
  };
}

export type RegistrationService = ReturnType<typeof createRegistrationService>;
