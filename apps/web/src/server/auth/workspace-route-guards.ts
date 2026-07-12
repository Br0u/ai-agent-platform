import "server-only";

import { redirect } from "next/navigation";

import { AuthAccessError, requireCustomer, requireWorkforce } from "./access";

const LOGIN_ERROR_CODES = new Set([
  "AUTH_SESSION_REQUIRED",
  "AUTH_REALM_MISMATCH",
  "AUTH_ACCOUNT_DISABLED",
  "AUTH_ACCOUNT_NOT_ACTIVE",
]);

export async function requireConsoleShell() {
  try {
    return await requireCustomer({ onboardingAllowed: true });
  } catch (error) {
    if (error instanceof AuthAccessError && LOGIN_ERROR_CODES.has(error.code)) {
      redirect("/login?returnTo=%2Fconsole");
    }
    throw error;
  }
}

export async function requireAdminShell() {
  try {
    return await requireWorkforce();
  } catch (error) {
    if (
      error instanceof AuthAccessError &&
      error.code === "AUTH_PASSWORD_CHANGE_REQUIRED"
    ) {
      redirect("/staff/change-password?returnTo=%2Fadmin");
    }
    if (
      error instanceof AuthAccessError &&
      error.code === "AUTH_TOTP_SETUP_REQUIRED"
    ) {
      redirect("/staff/two-factor?returnTo=%2Fadmin");
    }
    if (error instanceof AuthAccessError && LOGIN_ERROR_CODES.has(error.code)) {
      redirect("/staff/login?returnTo=%2Fadmin");
    }
    throw error;
  }
}

export async function requireConsolePage() {
  try {
    return await requireCustomer();
  } catch (error) {
    if (
      error instanceof AuthAccessError &&
      error.code === "AUTH_ACCOUNT_NOT_ACTIVE"
    ) {
      redirect("/console/onboarding");
    }
    if (error instanceof AuthAccessError && LOGIN_ERROR_CODES.has(error.code)) {
      redirect("/login?returnTo=%2Fconsole");
    }
    throw error;
  }
}
