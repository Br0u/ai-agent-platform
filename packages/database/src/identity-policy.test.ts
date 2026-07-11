import { describe, expect, it } from "vitest";

import {
  canAssignRole,
  canEnterApplication,
  canTransition,
} from "./identity-policy";

describe("identity policy", () => {
  describe("canAssignRole", () => {
    it("rejects cross-realm role assignment", () => {
      expect(canAssignRole("customer", "workforce")).toBe(false);
    });

    it("allows same-realm role assignment", () => {
      expect(canAssignRole("customer", "customer")).toBe(true);
      expect(canAssignRole("workforce", "workforce")).toBe(true);
    });
  });

  describe("canEnterApplication", () => {
    it("keeps pending customers in onboarding", () => {
      expect(canEnterApplication("pending_review", "onboarding")).toBe(true);
      expect(canEnterApplication("pending_review", "console")).toBe(false);
    });

    it("allows active users into the console only", () => {
      expect(canEnterApplication("active", "console")).toBe(true);
      expect(canEnterApplication("active", "onboarding")).toBe(false);
    });

    it("lets rejected customers view onboarding status but blocks the console", () => {
      expect(canEnterApplication("rejected", "onboarding")).toBe(true);
      expect(canEnterApplication("rejected", "console")).toBe(false);
    });

    it("blocks disabled users", () => {
      expect(canEnterApplication("disabled", "onboarding")).toBe(false);
      expect(canEnterApplication("disabled", "console")).toBe(false);
    });
  });

  describe("canTransition", () => {
    it("allows explicit review decisions and disabling an active user", () => {
      expect(canTransition("pending_review", "active")).toBe(true);
      expect(canTransition("pending_review", "rejected")).toBe(true);
      expect(canTransition("active", "disabled")).toBe(true);
    });

    it("allows managed reactivation without returning to review", () => {
      expect(canTransition("disabled", "active")).toBe(true);
      expect(canTransition("disabled", "pending_review")).toBe(false);
    });

    it("does not resurrect rejected users", () => {
      expect(canTransition("rejected", "pending_review")).toBe(false);
      expect(canTransition("rejected", "active")).toBe(false);
    });

    it("rejects implicit and no-op transitions", () => {
      expect(canTransition("pending_review", "disabled")).toBe(false);
      expect(canTransition("active", "pending_review")).toBe(false);
      expect(canTransition("active", "active")).toBe(false);
    });
  });
});
