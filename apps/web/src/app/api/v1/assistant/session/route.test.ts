import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { createAnonymousSessionManager } from "@/server/assistant/anonymous-session";
import { resolveAnonymousSessionSettings } from "@/server/assistant/anonymous-session-config";
import { createAssistantSessionDeleteHandler } from "./handler";
import * as route from "./route";

const START = Date.parse("2026-07-13T11:30:00.000Z");

function fixture(origin = "https://portal.example.com") {
  let seed = 0;
  let now = START;
  const manager = createAnonymousSessionManager({
    settings: resolveAnonymousSessionSettings({
      ASSISTANT_PUBLIC_ORIGIN: origin,
      ASSISTANT_SESSION_SECRET: "0123456789abcdef0123456789abcdef",
    }),
    now: () => now,
    randomBytes: (length) =>
      Uint8Array.from({ length }, (_, index) => (seed++ + index) % 256),
  });
  return {
    manager,
    setNow(value: number) {
      now = value;
    },
  };
}

describe("DELETE /api/v1/assistant/session", () => {
  it("clears the exact cookie and deletes only by the derived internal ID", async () => {
    const { manager } = fixture();
    const session = manager.resolve(new Headers(), { kind: "anonymous" });
    const deleteInternalSession = vi.fn(async () => undefined);
    const DELETE = createAssistantSessionDeleteHandler({
      manager,
      resolveActor: async () => ({ kind: "anonymous" }),
      deleteInternalSession,
    });

    const response = await DELETE(
      new Request("https://portal.example.com/api/v1/assistant/session", {
        method: "DELETE",
        headers: {
          cookie: `${session.cookie.name}=${session.cookie.value}`,
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBe(manager.clearCookie());
    expect(deleteInternalSession).toHaveBeenCalledExactlyOnceWith(
      session.internalSessionId,
    );
    expect(deleteInternalSession).not.toHaveBeenCalledWith(
      session.cookie.value,
    );
  });

  it("uses the runtime deletion method by default only after a valid signed Cookie", async () => {
    const { manager } = fixture();
    const session = manager.resolve(new Headers(), { kind: "anonymous" });
    const deleteSession = vi.fn(async () => undefined);
    const getRuntime = vi.fn(() => ({ deleteSession }));
    const DELETE = createAssistantSessionDeleteHandler({
      manager,
      resolveActor: async () => ({ kind: "anonymous" }),
      getRuntime,
    });

    const response = await DELETE(
      new Request("https://portal.example.com/api/v1/assistant/session", {
        method: "DELETE",
        headers: {
          cookie: `${session.cookie.name}=${session.cookie.value}`,
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(getRuntime).toHaveBeenCalledOnce();
    expect(deleteSession).toHaveBeenCalledExactlyOnceWith(
      session.internalSessionId,
    );
    expect(deleteSession).not.toHaveBeenCalledWith(session.cookie.value);
  });

  it.each([
    ["missing", undefined],
    ["invalid", "__Host-aap_assistant_sid=bad"],
    ["duplicate", "__Host-aap_assistant_sid=bad; __Host-aap_assistant_sid=bad"],
  ])(
    "only clears a %s cookie without remote deletion",
    async (_name, cookie) => {
      const { manager } = fixture();
      const deleteSession = vi.fn(async () => undefined);
      const getRuntime = vi.fn(() => ({ deleteSession }));
      const DELETE = createAssistantSessionDeleteHandler({
        manager,
        resolveActor: async () => ({ kind: "anonymous" }),
        getRuntime,
      });

      const response = await DELETE(
        new Request("https://portal.example.com/api/v1/assistant/session", {
          method: "DELETE",
          headers: cookie ? { cookie } : undefined,
        }),
      );

      expect(response.status).toBe(204);
      expect(response.headers.get("set-cookie")).toBe(manager.clearCookie());
      expect(getRuntime).not.toHaveBeenCalled();
      expect(deleteSession).not.toHaveBeenCalled();
    },
  );

  it("clears an expired cookie without invoking remote deletion", async () => {
    const { manager, setNow } = fixture();
    const session = manager.resolve(new Headers(), { kind: "anonymous" });
    setNow(START + 30 * 60 * 1000);
    const deleteInternalSession = vi.fn(async () => undefined);
    const DELETE = createAssistantSessionDeleteHandler({
      manager,
      resolveActor: async () => ({ kind: "anonymous" }),
      deleteInternalSession,
    });

    const response = await DELETE(
      new Request("https://portal.example.com/api/v1/assistant/session", {
        method: "DELETE",
        headers: {
          cookie: `${session.cookie.name}=${session.cookie.value}`,
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toBe(manager.clearCookie());
    expect(deleteInternalSession).not.toHaveBeenCalled();
  });

  it("still returns 204 and clears the Cookie when runtime cleanup fails", async () => {
    const { manager } = fixture();
    const session = manager.resolve(new Headers(), { kind: "anonymous" });
    const deleteSession = vi
      .fn()
      .mockRejectedValue(new Error("raw remote cleanup URL and session"));
    const DELETE = createAssistantSessionDeleteHandler({
      manager,
      resolveActor: async () => ({ kind: "anonymous" }),
      getRuntime: () => ({ deleteSession }),
    });

    const response = await DELETE(
      new Request("https://portal.example.com/api/v1/assistant/session", {
        method: "DELETE",
        headers: {
          cookie: `${session.cookie.name}=${session.cookie.value}`,
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toBe(manager.clearCookie());
    expect(await response.text()).toBe("");
  });

  it("provides an explicit placeholder no-op and never claims remote deletion", async () => {
    const source = readFileSync(
      "src/app/api/v1/assistant/session/handler.ts",
      "utf8",
    );
    expect(source).toContain("placeholderAssistantSessionDeletion");
    expect(source).not.toMatch(/deleted\s*:\s*true/iu);
  });

  it("exports DELETE only", () => {
    expect(route.DELETE).toBeTypeOf("function");
    expect(Object.keys(route)).toEqual(["DELETE"]);
  });
});
