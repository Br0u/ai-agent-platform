"use server";

import { headers } from "next/headers";

import { resolveTrustedRequestIp } from "../auth/shared-options";
import {
  createDefaultTypedDownloadResourceActions,
  type TypedDownloadResourceActionState,
} from "./actions";

async function typedActions() {
  const requestHeaders = await headers();
  const ipAddress = resolveTrustedRequestIp(requestHeaders);
  const userAgent = requestHeaders
    .get("user-agent")
    ?.replace(/[\u0000-\u001f\u007f]/gu, "")
    .trim()
    .slice(0, 512);
  return createDefaultTypedDownloadResourceActions({
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
  });
}

export async function createTypedDownloadResourceAction(
  previous: TypedDownloadResourceActionState,
  formData: FormData,
) {
  return (await typedActions()).createTypedDownloadResourceAction(
    previous,
    formData,
  );
}

export async function saveTypedDownloadDraftAction(
  previous: TypedDownloadResourceActionState,
  formData: FormData,
) {
  return (await typedActions()).saveTypedDownloadDraftAction(
    previous,
    formData,
  );
}

export async function publishTypedDownloadResourceAction(
  previous: TypedDownloadResourceActionState,
  formData: FormData,
) {
  return (await typedActions()).publishTypedDownloadResourceAction(
    previous,
    formData,
  );
}

export async function downlineTypedDownloadResourceAction(
  previous: TypedDownloadResourceActionState,
  formData: FormData,
) {
  return (await typedActions()).downlineTypedDownloadResourceAction(
    previous,
    formData,
  );
}

export async function discardTypedDownloadDraftAction(
  previous: TypedDownloadResourceActionState,
  formData: FormData,
) {
  return (await typedActions()).discardTypedDownloadDraftAction(
    previous,
    formData,
  );
}

export async function removeDownloadDraftArtifactAction(
  previous: TypedDownloadResourceActionState,
  formData: FormData,
) {
  return (await typedActions()).removeDownloadDraftArtifactAction(
    previous,
    formData,
  );
}
