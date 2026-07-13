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

  it("uses anonymous binding when no customer session exists", async () => {
    const resolve = createAssistantActorResolver({
      getCurrentCustomer: async () => null,
    });

    await expect(
      resolve(new Request("https://portal.example.com/assistant")),
    ).resolves.toEqual({ kind: "anonymous" });
  });

  it("propagates access infrastructure failures instead of trusting caller input", async () => {
    const resolve = createAssistantActorResolver({
      getCurrentCustomer: async () => {
        throw new Error("database unavailable");
      },
    });

    await expect(
      resolve(
        new Request("https://portal.example.com/assistant", {
          method: "POST",
          body: JSON.stringify({ actorId: "customer-1" }),
        }),
      ),
    ).rejects.toThrow("database unavailable");
  });
});
