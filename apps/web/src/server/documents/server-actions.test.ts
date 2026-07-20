import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const wiring = vi.hoisted(() => ({
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
  revalidatePath: wiring.revalidatePath,
  updateTag: wiring.updateTag,
}));
vi.mock("../auth/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/access")>()),
  requirePermission: wiring.requirePermission,
}));
vi.mock("../auth/sensitive-action", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/sensitive-action")>()),
  requireSensitiveWorkforceAction: wiring.requireSensitive,
}));
vi.mock("./repository", () => ({
  createDatabaseDocumentRepository: wiring.createRepository,
}));
vi.mock("./service", () => ({
  createDocumentService: wiring.createService,
}));

import type { DocumentActionState } from "./actions";
import {
  archiveDocumentAction,
  createDocumentAction,
  deleteDocumentAction,
  publishDocumentAction,
  restoreDocumentAction,
  saveDocumentAction,
} from "./server-actions";

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

beforeEach(() => {
  vi.clearAllMocks();
  wiring.requirePermission.mockResolvedValue(actor);
  wiring.requireSensitive.mockResolvedValue(actor);
  wiring.createRepository.mockReturnValue({ repository: true });
  wiring.createService.mockReturnValue(wiring.service);
  for (const method of Object.values(wiring.service)) {
    method.mockResolvedValue({ id: documentId });
  }
});

describe("document server action boundary", () => {
  it.each([
    ["create", createDocumentAction, createForm, "create", "normal", false],
    ["save", saveDocumentAction, saveForm, "save", "normal", false],
    [
      "publish",
      publishDocumentAction,
      mutationForm,
      "publish",
      "admin:docs",
      true,
    ],
    [
      "archive",
      archiveDocumentAction,
      mutationForm,
      "archive",
      "admin:docs",
      true,
    ],
    [
      "delete",
      deleteDocumentAction,
      mutationForm,
      "delete",
      "admin:docs:delete",
      true,
    ],
    [
      "restore",
      restoreDocumentAction,
      mutationForm,
      "restore",
      "admin:docs:delete",
      true,
    ],
  ] as const)(
    "wires the real %s wrapper through default dependencies",
    async (
      _name,
      wrapper,
      makeForm,
      method,
      permission,
      publicInvalidation,
    ) => {
      await expect(wrapper(initialState, makeForm())).resolves.toEqual({
        kind: "success",
      });

      expect(wiring.createRepository).toHaveBeenCalledOnce();
      expect(wiring.createService).toHaveBeenCalledWith({ repository: true });
      expect(wiring.service[method]).toHaveBeenCalledOnce();
      if (permission === "normal") {
        expect(wiring.requirePermission).toHaveBeenCalledWith("admin:docs");
        expect(wiring.requireSensitive).not.toHaveBeenCalled();
      } else {
        expect(wiring.requireSensitive).toHaveBeenCalledWith(permission);
        expect(wiring.requirePermission).not.toHaveBeenCalled();
      }
      expect(wiring.revalidatePath).toHaveBeenCalledWith("/admin/docs");
      if (publicInvalidation) {
        expect(wiring.updateTag).toHaveBeenCalledWith("documents");
        expect(wiring.revalidatePath).toHaveBeenCalledWith("/docs", "layout");
      } else {
        expect(wiring.updateTag).not.toHaveBeenCalled();
      }
    },
  );

  it("keeps the client import on a top-level use-server wrapper module", () => {
    const wrapperSource = readFileSync(
      resolve(process.cwd(), "src/server/documents/server-actions.ts"),
      "utf8",
    );
    const actionSource = readFileSync(
      resolve(process.cwd(), "src/server/documents/actions.ts"),
      "utf8",
    );
    const editorSource = readFileSync(
      resolve(process.cwd(), "src/components/admin/document-editor.tsx"),
      "utf8",
    );

    expect(wrapperSource.trimStart().startsWith('"use server";')).toBe(true);
    expect(wrapperSource).not.toContain('import "server-only"');
    expect(wrapperSource).not.toContain("next/cache");
    expect(actionSource).not.toContain('"use server"');
    expect(editorSource).toContain('from "@/server/documents/server-actions"');
  });
});
