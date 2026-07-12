"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RegistrationActionState, ReviewActionState } from "./actions";
import {
  approveRegistrationAction,
  rejectRegistrationAction,
  submitRegistrationAction,
} from "./actions";

export async function submitRegistration(
  previous: RegistrationActionState,
  formData: FormData,
): Promise<RegistrationActionState> {
  const result = await submitRegistrationAction(previous, formData);
  if (result.kind === "success") redirect(result.redirectTo);
  return result;
}

export async function approveRegistration(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const result = await approveRegistrationAction(formData);
  if (result.kind === "reauth_required") redirect(result.redirectTo);
  if (result.kind === "success") revalidatePath("/admin/registrations");
  return result;
}

export async function rejectRegistration(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const result = await rejectRegistrationAction(formData);
  if (result.kind === "reauth_required") redirect(result.redirectTo);
  if (result.kind === "success") revalidatePath("/admin/registrations");
  return result;
}
