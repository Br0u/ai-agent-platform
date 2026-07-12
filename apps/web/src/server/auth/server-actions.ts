"use server";

import { redirect } from "next/navigation";
import QRCode from "qrcode";

import {
  createDefaultAuthActions,
  createDefaultStaffSecurityActions,
  type AuthActionState,
  type StaffSecurityActionState,
} from "./actions";

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
  if (result.kind === "success") redirect(result.redirectTo);
}

export async function staffLogoutAction(): Promise<void> {
  const result = await createDefaultAuthActions().staffLogout();
  if (result.kind === "success") redirect(result.redirectTo);
}

export async function changeStaffPasswordAction(
  formData: FormData,
): Promise<StaffSecurityActionState> {
  const result =
    await createDefaultStaffSecurityActions().changePassword(formData);
  if (result.kind === "success") redirect(result.redirectTo);
  return result;
}

export async function enrollStaffTwoFactorAction(
  formData: FormData,
): Promise<StaffSecurityActionState> {
  const result =
    await createDefaultStaffSecurityActions().enrollTwoFactor(formData);
  if (result.kind !== "enrollment") return result;
  return {
    ...result,
    qrDataUrl: await QRCode.toDataURL(result.totpURI, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
    }),
  };
}

export async function verifyStaffTwoFactorAction(
  formData: FormData,
): Promise<StaffSecurityActionState> {
  const result =
    await createDefaultStaffSecurityActions().verifyTwoFactor(formData);
  if (result.kind === "success") redirect(result.redirectTo);
  return result;
}

export async function removeStaffTwoFactorAction(
  formData: FormData,
): Promise<StaffSecurityActionState> {
  const result =
    await createDefaultStaffSecurityActions().removeTwoFactor(formData);
  if (result.kind === "success") redirect(result.redirectTo);
  return result;
}

export async function reauthenticateStaffAction(
  formData: FormData,
): Promise<StaffSecurityActionState> {
  const result =
    await createDefaultStaffSecurityActions().reauthenticate(formData);
  if (result.kind === "success") redirect(result.redirectTo);
  return result;
}
