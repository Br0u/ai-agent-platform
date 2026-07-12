"use server";

import { redirect } from "next/navigation";

import { createDefaultAuthActions, type AuthActionState } from "./actions";

export async function customerLoginAction(
  previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = await createDefaultAuthActions().customerLogin(
    previous,
    formData,
  );
  if (result.kind === "success") redirect(result.redirectTo);
  return result;
}

export async function staffLoginAction(
  previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = await createDefaultAuthActions().staffLogin(
    previous,
    formData,
  );
  if (result.kind === "success") redirect(result.redirectTo);
  return result;
}

export async function customerLogoutAction(): Promise<void> {
  const result = await createDefaultAuthActions().customerLogout();
  redirect(result.kind === "success" ? result.redirectTo : "/login");
}

export async function staffLogoutAction(): Promise<void> {
  const result = await createDefaultAuthActions().staffLogout();
  redirect(result.kind === "success" ? result.redirectTo : "/staff/login");
}
