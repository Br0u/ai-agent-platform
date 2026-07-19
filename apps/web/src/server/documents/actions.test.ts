import { beforeEach, describe, expect, it, vi } from "vitest";

import { DOCUMENT_LIMITS } from "@ai-agent-platform/document-content";

const defaultWiring = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireSensitive: vi.fn(),
  createRepository: vi.fn(),
  createService: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  service: {
    create: vi.fn(),
    save: vi.fn(),
    publish: vi.fn(),
    archive: vi.fn(),
    delete: vi.fn(),
    restore: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: defaultWiring.revalidatePath,
  updateTag: defaultWiring.updateTag,
}));
vi.mock("../auth/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/access")>()),
  requirePermission: defaultWiring.requirePermission,
}));
vi.mock("../auth/sensitive-action", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/sensitive-action")>()),
  requireSensitiveWorkforceAction: defaultWiring.requireSensitive,
}));
vi.mock("./repository", () => ({
  createDatabaseDocumentRepository: defaultWiring.createRepository,
}));
vi.mock("./service", () => ({
  createDocumentService: defaultWiring.createService,
}));

import { AuthAccessError } from "../auth/access";
import { SensitiveActionError } from "../auth/sensitive-action";
import {
  createDocumentAction,
  createDocumentActions,
  publishDocumentAction,
  type DocumentActionState,
} from "./actions";
import {
  DOCUMENT_ERROR_CODES,
  DocumentError,
  type DocumentErrorCode,
} from "./contracts";

const actor = { userId: "00000000-0000-4000-8000-000000000001" };
const documentId = "00000000-0000-4000-8000-000000000010";
const initialState: DocumentActionState = { kind: "idle" };

function createForm() {
  const form = new FormData();
  form.set("slug", "quick-start");
  form.set("title", "Quick start");
  form.set("summary", "Get started safely");
  form.set("source", "# Quick start");
  form.set("navigationLabel", "Quick start");
  form.set("navigationCode", "QUICK_START");
  form.set("navigationPosition", "10");
  return form;
}

function saveForm() {
  const form = createForm();
  form.set("id", documentId);
  form.set("expectedRevision", "2");
  form.set("expectedRowVersion", "3");
  return form;
}

function mutationForm() {
  const form = new FormData();
  form.set("id", documentId);
  form.set("expectedRevision", "2");
  form.set("expectedRowVersion", "3");
  return form;
}

function harness() {
  const service = {
    create: vi.fn().mockResolvedValue({ id: documentId }),
    save: vi.fn().mockResolvedValue({ id: documentId }),
    publish: vi.fn().mockResolvedValue({ id: documentId }),
    archive: vi.fn().mockResolvedValue({ id: documentId }),
    delete: vi.fn().mockResolvedValue({ id: documentId }),
    restore: vi.fn().mockResolvedValue({ id: documentId }),
  };
  const access = {
    requirePermission: vi.fn().mockResolvedValue(actor),
    requireSensitivePermission: vi.fn().mockResolvedValue(actor),
  };
  const cache = {
    revalidatePath: vi.fn(),
    updateTag: vi.fn(),
  };
  const reportInternalError = vi.fn();
  return {
    actions: createDocumentActions({
      service,
      access,
      cache,
      reportInternalError,
    }),
    service,
    access,
    cache,
    reportInternalError,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  defaultWiring.requirePermission.mockResolvedValue(actor);
  defaultWiring.requireSensitive.mockResolvedValue(actor);
  defaultWiring.createRepository.mockReturnValue({ repository: true });
  defaultWiring.createService.mockReturnValue(defaultWiring.service);
  for (const method of Object.values(defaultWiring.service)) {
    method.mockResolvedValue({ id: documentId });
  }
});

describe("document action authorization", () => {
  it.each([
    [
      "create",
      (value: ReturnType<typeof harness>) =>
        value.actions.createDocumentAction(initialState, createForm()),
      "create",
    ],
    [
      "save",
      (value: ReturnType<typeof harness>) =>
        value.actions.saveDocumentAction(initialState, saveForm()),
      "save",
    ],
  ] as const)(
    "uses normal admin:docs permission for %s",
    async (_name, run, method) => {
      const value = harness();

      await expect(run(value)).resolves.toEqual({ kind: "success" });

      expect(value.access.requirePermission).toHaveBeenCalledWith("admin:docs");
      expect(value.access.requireSensitivePermission).not.toHaveBeenCalled();
      expect(value.service[method]).toHaveBeenCalledOnce();
    },
  );

  it.each([
    [
      "publish",
      "admin:docs",
      (value: ReturnType<typeof harness>) =>
        value.actions.publishDocumentAction(initialState, mutationForm()),
      "publish",
    ],
    [
      "archive",
      "admin:docs",
      (value: ReturnType<typeof harness>) =>
        value.actions.archiveDocumentAction(initialState, mutationForm()),
      "archive",
    ],
    [
      "delete",
      "admin:docs:delete",
      (value: ReturnType<typeof harness>) =>
        value.actions.deleteDocumentAction(initialState, mutationForm()),
      "delete",
    ],
    [
      "restore",
      "admin:docs:delete",
      (value: ReturnType<typeof harness>) =>
        value.actions.restoreDocumentAction(initialState, mutationForm()),
      "restore",
    ],
  ] as const)(
    "uses sensitive %s permission for %s",
    async (_name, permission, run, method) => {
      const value = harness();

      await expect(run(value)).resolves.toEqual({ kind: "success" });

      expect(value.access.requireSensitivePermission).toHaveBeenCalledWith(
        permission,
      );
      expect(value.access.requirePermission).not.toHaveBeenCalled();
      expect(value.service[method]).toHaveBeenCalledOnce();
    },
  );

  it.each(["AUTH_REAUTH_REQUIRED", "AUTH_MFA_REQUIRED"] as const)(
    "returns a fixed reauth destination for %s without calling the service",
    async (code) => {
      const value = harness();
      value.access.requireSensitivePermission.mockRejectedValueOnce(
        new SensitiveActionError(code),
      );
      const form = mutationForm();
      form.set("returnTo", "https://attacker.example/steal");

      const result = await value.actions.publishDocumentAction(
        initialState,
        form,
      );

      expect(result).toEqual({
        kind: "reauth_required",
        code,
        redirectTo: "/staff/re-auth?returnTo=%2Fadmin%2Fdocs",
      });
      expect(value.service.publish).not.toHaveBeenCalled();
      expect(value.reportInternalError).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain("attacker.example");
    },
  );

  it("maps permission denial and stops before the service", async () => {
    const value = harness();
    value.access.requirePermission.mockRejectedValueOnce(
      new AuthAccessError("AUTH_PERMISSION_DENIED", 403),
    );

    await expect(
      value.actions.createDocumentAction(initialState, createForm()),
    ).resolves.toEqual({
      kind: "domain_error",
      code: "AUTH_PERMISSION_DENIED",
    });
    expect(value.service.create).not.toHaveBeenCalled();
    expect(value.reportInternalError).not.toHaveBeenCalled();
  });

  it.each(["AUTH_SESSION_REQUIRED", "AUTH_REALM_MISMATCH"] as const)(
    "maps real %s to the fixed staff login state",
    async (code) => {
      const value = harness();
      value.access.requirePermission.mockRejectedValueOnce(
        new AuthAccessError(code, code === "AUTH_SESSION_REQUIRED" ? 401 : 403),
      );

      await expect(
        value.actions.createDocumentAction(initialState, createForm()),
      ).resolves.toEqual({
        kind: "authentication_required",
        code,
        redirectTo: "/staff/login?returnTo=%2Fadmin%2Fdocs",
      });
      expect(value.service.create).not.toHaveBeenCalled();
      expect(value.reportInternalError).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "AUTH_PASSWORD_CHANGE_REQUIRED",
      "/staff/change-password?returnTo=%2Fadmin%2Fdocs",
    ],
    ["AUTH_TOTP_SETUP_REQUIRED", "/staff/two-factor?returnTo=%2Fadmin%2Fdocs"],
  ] as const)(
    "maps real %s to its fixed setup route",
    async (code, redirectTo) => {
      const value = harness();
      value.access.requirePermission.mockRejectedValueOnce(
        new AuthAccessError(code, 403),
      );

      await expect(
        value.actions.createDocumentAction(initialState, createForm()),
      ).resolves.toEqual({
        kind: "account_setup_required",
        code,
        redirectTo,
      });
      expect(value.service.create).not.toHaveBeenCalled();
      expect(value.reportInternalError).not.toHaveBeenCalled();
    },
  );

  it.each([
    "AUTH_ACCOUNT_DISABLED",
    "AUTH_ACCOUNT_NOT_ACTIVE",
    "AUTH_ORGANIZATION_REQUIRED",
    "AUTH_ORGANIZATION_AMBIGUOUS",
    "AUTH_ORGANIZATION_NOT_ACTIVE",
  ] as const)("maps real %s to a safe access state", async (code) => {
    const value = harness();
    value.access.requirePermission.mockRejectedValueOnce(
      new AuthAccessError(code, 403),
    );

    await expect(
      value.actions.createDocumentAction(initialState, createForm()),
    ).resolves.toEqual({ kind: "access_error", code });
    expect(value.service.create).not.toHaveBeenCalled();
    expect(value.reportInternalError).not.toHaveBeenCalled();
  });
});

describe("document action input boundary", () => {
  const draftFields = [
    "slug",
    "title",
    "summary",
    "source",
    "navigationLabel",
    "navigationCode",
    "navigationPosition",
  ] as const;
  const draftInvalidCases: ReadonlyArray<
    readonly [string, (form: FormData) => void]
  > = [
    ...draftFields.map(
      (field) =>
        [`missing ${field}`, (form: FormData) => form.delete(field)] as const,
    ),
    ...draftFields.map(
      (field) =>
        [
          `duplicate ${field}`,
          (form: FormData) => form.append(field, "duplicate"),
        ] as const,
    ),
    ["malformed slug", (form) => form.set("slug", "Bad Slug")],
    ["empty title", (form) => form.set("title", "")],
    ["empty summary", (form) => form.set("summary", "")],
    ["empty source", (form) => form.set("source", "")],
    ["empty navigation label", (form) => form.set("navigationLabel", "")],
    [
      "oversized slug",
      (form) => form.set("slug", "a".repeat(DOCUMENT_LIMITS.slug + 1)),
    ],
    [
      "oversized title",
      (form) => form.set("title", "t".repeat(DOCUMENT_LIMITS.title + 1)),
    ],
    [
      "oversized summary",
      (form) => form.set("summary", "s".repeat(DOCUMENT_LIMITS.summary + 1)),
    ],
    [
      "oversized source",
      (form) => form.set("source", "x".repeat(DOCUMENT_LIMITS.sourceBytes + 1)),
    ],
    [
      "oversized navigation label",
      (form) =>
        form.set(
          "navigationLabel",
          "l".repeat(DOCUMENT_LIMITS.navigationLabel + 1),
        ),
    ],
    [
      "malformed navigation code",
      (form) => form.set("navigationCode", "lower case"),
    ],
    [
      "oversized navigation code",
      (form) =>
        form.set(
          "navigationCode",
          "C".repeat(DOCUMENT_LIMITS.navigationCode + 1),
        ),
    ],
    [
      "malformed navigation position",
      (form) => form.set("navigationPosition", "1e2"),
    ],
    [
      "negative navigation position",
      (form) => form.set("navigationPosition", "-1"),
    ],
    [
      "oversized navigation position",
      (form) =>
        form.set("navigationPosition", String(DOCUMENT_LIMITS.position + 1)),
    ],
  ];

  it.each(draftInvalidCases)(
    "rejects create with %s",
    async (_name, mutate) => {
      const value = harness();
      const form = createForm();
      mutate(form);

      await expect(
        value.actions.createDocumentAction(initialState, form),
      ).resolves.toMatchObject({ kind: "validation_error" });
      expect(value.access.requirePermission).not.toHaveBeenCalled();
      expect(value.service.create).not.toHaveBeenCalled();
    },
  );

  it.each(draftInvalidCases)("rejects save with %s", async (_name, mutate) => {
    const value = harness();
    const form = saveForm();
    mutate(form);

    await expect(
      value.actions.saveDocumentAction(initialState, form),
    ).resolves.toMatchObject({ kind: "validation_error" });
    expect(value.access.requirePermission).not.toHaveBeenCalled();
    expect(value.service.save).not.toHaveBeenCalled();
  });

  const mutationInvalidCases: ReadonlyArray<
    [string, (form: FormData) => void]
  > = [
    ["missing id", (form) => form.delete("id")],
    ["duplicate id", (form) => form.append("id", documentId)],
    ["malformed id", (form) => form.set("id", "not-a-uuid")],
    ["negative id", (form) => form.set("id", "-1")],
    ["oversized id", (form) => form.set("id", "a".repeat(1_000))],
    ["missing revision", (form) => form.delete("expectedRevision")],
    ["duplicate revision", (form) => form.append("expectedRevision", "2")],
    ["malformed revision", (form) => form.set("expectedRevision", "1e2")],
    ["negative revision", (form) => form.set("expectedRevision", "-1")],
    [
      "oversized revision",
      (form) => form.set("expectedRevision", "2147483648"),
    ],
    ["missing row version", (form) => form.delete("expectedRowVersion")],
    ["duplicate row version", (form) => form.append("expectedRowVersion", "3")],
    ["malformed row version", (form) => form.set("expectedRowVersion", "3.1")],
    ["negative row version", (form) => form.set("expectedRowVersion", "-1")],
    [
      "oversized row version",
      (form) => form.set("expectedRowVersion", "9".repeat(100)),
    ],
  ];

  it.each([
    [
      "save",
      (value: ReturnType<typeof harness>, form: FormData) =>
        value.actions.saveDocumentAction(initialState, form),
      "save",
      saveForm,
    ],
    [
      "publish",
      (value: ReturnType<typeof harness>, form: FormData) =>
        value.actions.publishDocumentAction(initialState, form),
      "publish",
      mutationForm,
    ],
    [
      "archive",
      (value: ReturnType<typeof harness>, form: FormData) =>
        value.actions.archiveDocumentAction(initialState, form),
      "archive",
      mutationForm,
    ],
    [
      "delete",
      (value: ReturnType<typeof harness>, form: FormData) =>
        value.actions.deleteDocumentAction(initialState, form),
      "delete",
      mutationForm,
    ],
    [
      "restore",
      (value: ReturnType<typeof harness>, form: FormData) =>
        value.actions.restoreDocumentAction(initialState, form),
      "restore",
      mutationForm,
    ],
  ] as const)(
    "rejects every invalid mutation field for %s",
    async (_name, run, method, makeForm) => {
      for (const [caseName, mutate] of mutationInvalidCases) {
        const value = harness();
        const form = makeForm();
        mutate(form);

        const result = await run(value, form);

        expect(result, caseName).toMatchObject({ kind: "validation_error" });
        expect(value.service[method], caseName).not.toHaveBeenCalled();
      }
    },
  );

  it("rejects a File value and duplicate fields instead of using the first value", async () => {
    const value = harness();
    const form = createForm();
    form.delete("source");
    form.append("source", new File(["secret"], "source.md"));
    form.append("returnTo", "/admin/docs");
    form.append("returnTo", "https://attacker.example");

    await expect(
      value.actions.createDocumentAction(initialState, form),
    ).resolves.toMatchObject({ kind: "validation_error" });
    expect(value.service.create).not.toHaveBeenCalled();
  });
});

describe("document action stable states", () => {
  it.each(DOCUMENT_ERROR_CODES)(
    "maps documented error %s exactly",
    async (code) => {
      const value = harness();
      value.service.publish.mockRejectedValueOnce(
        new DocumentError(code as DocumentErrorCode),
      );

      await expect(
        value.actions.publishDocumentAction(initialState, mutationForm()),
      ).resolves.toEqual({ kind: "domain_error", code });
      expect(value.reportInternalError).not.toHaveBeenCalled();
    },
  );

  it("reports an unknown exception without its message and returns one generic state", async () => {
    const value = harness();
    const failure = Object.assign(
      new Error("duplicate key source=# Secret title=Private"),
      { code: "23505" },
    );
    value.service.create.mockRejectedValueOnce(failure);

    const result = await value.actions.createDocumentAction(
      initialState,
      createForm(),
    );

    expect(result).toEqual({
      kind: "domain_error",
      code: "DOCUMENT_INTERNAL_ERROR",
    });
    expect(value.reportInternalError).toHaveBeenCalledWith({
      event: "document.action_internal_error",
      errorName: "Error",
      code: "23505",
    });
    expect(JSON.stringify(value.reportInternalError.mock.calls)).not.toContain(
      "Secret",
    );
    expect(JSON.stringify(result)).not.toContain("duplicate key");
  });

  it("keeps the generic result stable if the reporting sink fails", async () => {
    const value = harness();
    value.service.create.mockRejectedValueOnce(new Error("database offline"));
    value.reportInternalError.mockImplementationOnce(() => {
      throw new Error("reporter offline");
    });

    await expect(
      value.actions.createDocumentAction(initialState, createForm()),
    ).resolves.toEqual({
      kind: "domain_error",
      code: "DOCUMENT_INTERNAL_ERROR",
    });
  });
});

describe("document action cache invalidation", () => {
  it.each([
    [
      "create",
      (value: ReturnType<typeof harness>) =>
        value.actions.createDocumentAction(initialState, createForm()),
    ],
    [
      "save",
      (value: ReturnType<typeof harness>) =>
        value.actions.saveDocumentAction(initialState, saveForm()),
    ],
  ] as const)(
    "invalidates only the admin page after %s",
    async (_name, run) => {
      const value = harness();

      await run(value);

      expect(value.cache.revalidatePath).toHaveBeenCalledExactlyOnceWith(
        "/admin/docs",
      );
      expect(value.cache.updateTag).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "publish",
      (value: ReturnType<typeof harness>) =>
        value.actions.publishDocumentAction(initialState, mutationForm()),
    ],
    [
      "archive",
      (value: ReturnType<typeof harness>) =>
        value.actions.archiveDocumentAction(initialState, mutationForm()),
    ],
    [
      "delete",
      (value: ReturnType<typeof harness>) =>
        value.actions.deleteDocumentAction(initialState, mutationForm()),
    ],
    [
      "restore",
      (value: ReturnType<typeof harness>) =>
        value.actions.restoreDocumentAction(initialState, mutationForm()),
    ],
  ] as const)(
    "invalidates admin and public documents after %s",
    async (_name, run) => {
      const value = harness();

      await run(value);

      expect(value.cache.revalidatePath).toHaveBeenNthCalledWith(
        1,
        "/admin/docs",
      );
      expect(value.cache.updateTag).toHaveBeenCalledExactlyOnceWith(
        "documents",
      );
      expect(value.cache.revalidatePath).toHaveBeenNthCalledWith(
        2,
        "/docs",
        "layout",
      );
    },
  );

  it("does not invalidate any cache when the mutation fails", async () => {
    const value = harness();
    value.service.publish.mockRejectedValueOnce(
      new DocumentError("DOCUMENT_NOT_PUBLISHABLE"),
    );

    await value.actions.publishDocumentAction(initialState, mutationForm());

    expect(value.cache.revalidatePath).not.toHaveBeenCalled();
    expect(value.cache.updateTag).not.toHaveBeenCalled();
  });

  it.each(["admin_path", "documents_tag", "docs_layout", "all"] as const)(
    "preserves committed success and attempts later invalidations when %s fails",
    async (failurePoint) => {
      const value = harness();
      value.cache.revalidatePath.mockImplementation(
        (path: string, type?: "layout" | "page") => {
          if (
            failurePoint === "all" ||
            (failurePoint === "admin_path" && path === "/admin/docs") ||
            (failurePoint === "docs_layout" &&
              path === "/docs" &&
              type === "layout")
          ) {
            throw new Error(`cache ${path}`);
          }
        },
      );
      value.cache.updateTag.mockImplementation(() => {
        if (failurePoint === "documents_tag" || failurePoint === "all") {
          throw new Error("cache documents tag");
        }
      });

      await expect(
        value.actions.publishDocumentAction(initialState, mutationForm()),
      ).resolves.toEqual({ kind: "success" });

      expect(value.service.publish).toHaveBeenCalledOnce();
      expect(value.cache.revalidatePath).toHaveBeenCalledWith("/admin/docs");
      expect(value.cache.updateTag).toHaveBeenCalledWith("documents");
      expect(value.cache.revalidatePath).toHaveBeenCalledWith(
        "/docs",
        "layout",
      );
      expect(value.reportInternalError).toHaveBeenCalledTimes(
        failurePoint === "all" ? 3 : 1,
      );
    },
  );
});

describe("default document action wiring", () => {
  it("connects exported create to normal access, service and admin cache", async () => {
    await expect(
      createDocumentAction(initialState, createForm()),
    ).resolves.toEqual({ kind: "success" });

    expect(defaultWiring.createRepository).toHaveBeenCalledOnce();
    expect(defaultWiring.createService).toHaveBeenCalledWith({
      repository: true,
    });
    expect(defaultWiring.requirePermission).toHaveBeenCalledWith("admin:docs");
    expect(defaultWiring.service.create).toHaveBeenCalledOnce();
    expect(defaultWiring.revalidatePath).toHaveBeenCalledExactlyOnceWith(
      "/admin/docs",
    );
    expect(defaultWiring.updateTag).not.toHaveBeenCalled();
  });

  it("connects exported publish to sensitive access and public cache", async () => {
    await expect(
      publishDocumentAction(initialState, mutationForm()),
    ).resolves.toEqual({ kind: "success" });

    expect(defaultWiring.createRepository).toHaveBeenCalledOnce();
    expect(defaultWiring.createService).toHaveBeenCalledWith({
      repository: true,
    });
    expect(defaultWiring.requireSensitive).toHaveBeenCalledWith("admin:docs");
    expect(defaultWiring.service.publish).toHaveBeenCalledOnce();
    expect(defaultWiring.revalidatePath).toHaveBeenNthCalledWith(
      1,
      "/admin/docs",
    );
    expect(defaultWiring.updateTag).toHaveBeenCalledWith("documents");
    expect(defaultWiring.revalidatePath).toHaveBeenNthCalledWith(
      2,
      "/docs",
      "layout",
    );
  });
});
