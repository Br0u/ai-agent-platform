"use server";

import { headers } from "next/headers";

import { resolveTrustedRequestIp } from "../auth/shared-options";
import {
  createDefaultDownloadResourceActions,
  type DownloadResourceActionState,
} from "./actions";

async function actions() {
  const requestHeaders = await headers();
  const ipAddress = resolveTrustedRequestIp(requestHeaders);
  const userAgent = requestHeaders
    .get("user-agent")
    ?.replace(/[\u0000-\u001f\u007f]/gu, "")
    .trim()
    .slice(0, 512);
  return createDefaultDownloadResourceActions({
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
  });
}

export async function createDownloadResourceAction(
  previous: DownloadResourceActionState,
  formData: FormData,
) {
  return (await actions()).createDownloadResourceAction(previous, formData);
}

export async function saveDownloadDraftAction(
  previous: DownloadResourceActionState,
  formData: FormData,
) {
  return (await actions()).saveDownloadDraftAction(previous, formData);
}

export async function publishDownloadResourceAction(
  previous: DownloadResourceActionState,
  formData: FormData,
) {
  return (await actions()).publishDownloadResourceAction(previous, formData);
}

export async function downlineDownloadResourceAction(
  previous: DownloadResourceActionState,
  formData: FormData,
) {
  return (await actions()).downlineDownloadResourceAction(previous, formData);
}

export async function discardDownloadDraftAction(
  previous: DownloadResourceActionState,
  formData: FormData,
) {
  return (await actions()).discardDownloadDraftAction(previous, formData);
}

export async function removeDownloadDraftFileAction(
  previous: DownloadResourceActionState,
  formData: FormData,
) {
  return (await actions()).removeDownloadDraftFileAction(previous, formData);
}
