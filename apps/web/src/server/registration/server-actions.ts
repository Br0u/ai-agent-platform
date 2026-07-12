"use server";

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
  return approveRegistrationAction(formData);
}

export async function rejectRegistration(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  return rejectRegistrationAction(formData);
}
