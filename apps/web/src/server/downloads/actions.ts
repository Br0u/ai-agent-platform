import "server-only";

import { revalidatePath } from "next/cache";

import { downloadResourceService } from "./service";

const INVALID = "字段值无效";

export type DownloadResourceActionState =
  | { kind: "idle" }
  | { kind: "success" }
  | { kind: "validation_error"; fieldErrors: Record<string, string[]> }
  | { kind: "domain_error"; code: "DOWNLOAD_RESOURCE_ACTION_FAILED" };

export function createDownloadResourceActionState(): DownloadResourceActionState {
  return { kind: "idle" };
}

function one(formData: FormData, field: string) {
  const values = formData.getAll(field);
  return values.length === 1 && typeof values[0] === "string"
    ? values[0]
    : null;
}

function fields(
  formData: FormData,
  names: readonly string[],
):
  | { values: Record<string, string> }
  | { fieldErrors: Record<string, string[]> } {
  const values: Record<string, string> = {};
  const fieldErrors: Record<string, string[]> = {};
  for (const name of names) {
    const value = one(formData, name);
    if (value === null) fieldErrors[name] = [INVALID];
    else values[name] = value;
  }
  return Object.keys(fieldErrors).length ? { fieldErrors } : { values };
}

function rowVersion(value: string) {
  return /^(?:[1-9][0-9]*)$/u.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
}

async function run(
  callback: () => Promise<unknown>,
): Promise<DownloadResourceActionState> {
  try {
    await callback();
    revalidatePath("/admin/downloads");
    revalidatePath("/downloads", "layout");
    return { kind: "success" };
  } catch {
    return { kind: "domain_error", code: "DOWNLOAD_RESOURCE_ACTION_FAILED" };
  }
}

function mutation(
  formData: FormData,
):
  | { values: { id: string; expectedRowVersion: number } }
  | { fieldErrors: Record<string, string[]> } {
  const parsed = fields(formData, ["id", "expectedRowVersion"]);
  if ("fieldErrors" in parsed) return parsed;
  const expectedRowVersion = rowVersion(parsed.values.expectedRowVersion);
  if (expectedRowVersion === null)
    return { fieldErrors: { expectedRowVersion: [INVALID] } };
  return { values: { id: parsed.values.id, expectedRowVersion } };
}

export async function createDownloadResourceAction(
  _previous: DownloadResourceActionState,
  formData: FormData,
): Promise<DownloadResourceActionState> {
  const parsed = fields(formData, ["key", "adminLabel"]);
  if ("fieldErrors" in parsed) return { kind: "validation_error", ...parsed };
  return run(() => downloadResourceService.createResource(parsed.values));
}

export async function saveDownloadDraftAction(
  _previous: DownloadResourceActionState,
  formData: FormData,
): Promise<DownloadResourceActionState> {
  const parsed = fields(formData, [
    "id",
    "expectedRowVersion",
    "name",
    "product",
    "category",
    "resourceType",
    "description",
    "sortOrder",
    "previewPolicy",
    "downloadPolicy",
  ]);
  if ("fieldErrors" in parsed) return { kind: "validation_error", ...parsed };
  const expectedRowVersion = rowVersion(parsed.values.expectedRowVersion);
  const sortOrder = /^(?:0|[1-9][0-9]*)$/u.test(parsed.values.sortOrder)
    ? Number(parsed.values.sortOrder)
    : null;
  if (
    expectedRowVersion === null ||
    sortOrder === null ||
    !Number.isSafeInteger(sortOrder)
  ) {
    return {
      kind: "validation_error",
      fieldErrors: {
        ...(expectedRowVersion === null
          ? { expectedRowVersion: [INVALID] }
          : {}),
        ...(sortOrder === null || !Number.isSafeInteger(sortOrder)
          ? { sortOrder: [INVALID] }
          : {}),
      },
    };
  }
  return run(() =>
    downloadResourceService.saveDraft({
      ...parsed.values,
      expectedRowVersion,
      sortOrder,
    }),
  );
}

function mutate(
  formData: FormData,
  method: (input: {
    id: string;
    expectedRowVersion: number;
  }) => Promise<unknown>,
) {
  const parsed = mutation(formData);
  if ("fieldErrors" in parsed)
    return Promise.resolve({
      kind: "validation_error",
      ...parsed,
    } as DownloadResourceActionState);
  return run(() => method(parsed.values));
}

export const publishDownloadResourceAction = (
  _previous: DownloadResourceActionState,
  formData: FormData,
) => mutate(formData, downloadResourceService.publish);
export const downlineDownloadResourceAction = (
  _previous: DownloadResourceActionState,
  formData: FormData,
) => mutate(formData, downloadResourceService.downline);
export const discardDownloadDraftAction = (
  _previous: DownloadResourceActionState,
  formData: FormData,
) => mutate(formData, downloadResourceService.discardDraft);
export const removeDownloadDraftFileAction = (
  _previous: DownloadResourceActionState,
  formData: FormData,
) => mutate(formData, downloadResourceService.removeDraftFile);
