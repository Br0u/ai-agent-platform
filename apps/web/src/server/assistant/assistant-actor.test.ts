import { describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/auth/access";
import { createAssistantActorResolver } from "./assistant-actor";

function customer(userId: string): Actor {
  return {
    userId,
    realm: "customer",
    status: "active",
    displayName: "Customer",
    emailVerificationStatus: "verified",
    organization: null,
    organizationMembershipCount: 0,
  };
}

describe("assistant actor boundary", () => {
  it("binds a server-authenticated customer without accepting a body actor", async () => {
    const getCurrentCustomer = vi.fn(async () => customer("customer-1"));
    const resolve = createAssistantActorResolver({ getCurrentCustomer });
    const request = new Request(
      "https://portal.example.com/api/v1/assistant/chat",
      {
        method: "POST",
        headers: { cookie: "aap_customer_session=opaque" },
        body: JSON.stringify({ actorId: "attacker", userId: "attacker" }),
      },
    );

    await expect(resolve(request)).resolves.toEqual({
      kind: "customer",
      userId: "customer-1",
    });
    expect(getCurrentCustomer).toHaveBeenCalledExactlyOnceWith(request.headers);
  });

  it("short-circuits anonymous requests without constructing customer access", async () => {
    const getCurrentCustomer = vi.fn(async () => customer("unexpected"));
    const resolve = createAssistantActorResolver({
      getCurrentCustomer,
    });

    await expect(
      resolve(new Request("https://portal.example.com/assistant")),
    ).resolves.toEqual({ kind: "anonymous" });
    expect(getCurrentCustomer).not.toHaveBeenCalled();
  });

  it("ignores caller-supplied actor data when no auth cookie exists", async () => {
    const getCurrentCustomer = vi.fn(async () => customer("unexpected"));
    const resolve = createAssistantActorResolver({
      getCurrentCustomer,
    });

    await expect(
      resolve(
        new Request("https://portal.example.com/assistant", {
          method: "POST",
          body: JSON.stringify({ actorId: "customer-1" }),
        }),
      ),
    ).resolves.toEqual({ kind: "anonymous" });
    expect(getCurrentCustomer).not.toHaveBeenCalled();
  });

  it.each([
    "aap_customer_session=opaque",
    "__Secure-aap_customer_session=opaque",
    "aap_customer_session=one; aap_customer_session=two",
    "aap_customer_session=one; __Secure-aap_customer_session=two",
  ])(
    "server-validates requests carrying a real customer cookie shape: %s",
    async (cookie) => {
      const getCurrentCustomer = vi.fn(async () => null);
      const resolve = createAssistantActorResolver({ getCurrentCustomer });
      const request = new Request("https://portal.example.com/assistant", {
        headers: { cookie },
      });

      await expect(resolve(request)).resolves.toEqual({ kind: "anonymous" });
      expect(getCurrentCustomer).toHaveBeenCalledExactlyOnceWith(
        request.headers,
      );
    },
  );

  it("does not treat similarly named or staff cookies as customer auth", async () => {
    const getCurrentCustomer = vi.fn(async () => customer("unexpected"));
    const resolve = createAssistantActorResolver({ getCurrentCustomer });

    await expect(
      resolve(
        new Request("https://portal.example.com/assistant", {
          headers: {
            cookie: "aap_customer_session_extra=wrong; aap_staff_session=staff",
          },
        }),
      ),
    ).resolves.toEqual({ kind: "anonymous" });
    expect(getCurrentCustomer).not.toHaveBeenCalled();
  });
});
