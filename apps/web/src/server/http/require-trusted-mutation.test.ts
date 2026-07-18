import { describe, expect, it } from "vitest";

import type { AuthEnvironment } from "../auth/shared-options";
import {
  MutationRequestError,
  requireTrustedJsonMutation,
} from "./require-trusted-mutation";

const AUTH_ENVIRONMENT: AuthEnvironment = {
  BETTER_AUTH_SECRET: "better-auth-secret-that-is-at-least-32-bytes",
  BETTER_AUTH_URL: "https://admin.example.test",
  BETTER_AUTH_TRUSTED_ORIGINS:
    "https://admin.example.test,https://staff.example.test",
};

function requestWithHeaders(headers: HeadersInit): Request {
  return new Request("https://internal.invalid/ignored", {
    method: "POST",
    headers,
    body: "should-never-be-read",
  });
}

function unreadableRequest(headers: Headers): Request {
  return {
    headers,
    get body(): never {
      throw new Error("request body was read before the mutation guard");
    },
  } as unknown as Request;
}

describe("trusted JSON mutation guard", () => {
  it.each([
    "application/json",
    "APPLICATION/JSON",
    " application/json ; charset = UTF-8 ",
    'application/json;charset="utf-8"',
  ])("accepts a trusted exact Origin and JSON media type %s", (contentType) => {
    expect(() =>
      requireTrustedJsonMutation(
        requestWithHeaders({
          origin: "https://staff.example.test",
          "sec-fetch-site": "same-origin",
          "content-type": contentType,
        }),
        AUTH_ENVIRONMENT,
      ),
    ).not.toThrow();
  });

  it("allows absent fetch metadata but rejects every value except same-origin", () => {
    expect(() =>
      requireTrustedJsonMutation(
        requestWithHeaders({
          origin: "https://admin.example.test",
          "content-type": "application/json",
        }),
        AUTH_ENVIRONMENT,
      ),
    ).not.toThrow();

    for (const site of ["same-site", "cross-site", "none", "SAME-ORIGIN"]) {
      expect(() =>
        requireTrustedJsonMutation(
          requestWithHeaders({
            origin: "https://admin.example.test",
            "sec-fetch-site": site,
            "content-type": "application/json",
          }),
          AUTH_ENVIRONMENT,
        ),
      ).toThrowError(MutationRequestError);
    }
  });

  it.each([
    undefined,
    "null",
    "https://attacker.example.test",
    "https://admin.example.test/",
    "https://admin.example.test, https://admin.example.test",
  ])("rejects missing, null, untrusted or non-single Origin %s", (origin) => {
    const headers = new Headers({
      "content-type": "application/json",
      host: "admin.example.test",
      "x-forwarded-host": "admin.example.test",
      "x-forwarded-proto": "https",
    });
    if (origin !== undefined) headers.set("origin", origin);

    expect(() =>
      requireTrustedJsonMutation(unreadableRequest(headers), AUTH_ENVIRONMENT),
    ).toThrowError(
      expect.objectContaining({
        code: "MUTATION_REQUEST_REJECTED",
        message: "Mutation request rejected",
      }),
    );
  });

  it("rejects duplicate Origin and Sec-Fetch-Site header lists", () => {
    const duplicateOrigin = new Headers({
      "content-type": "application/json",
    });
    duplicateOrigin.append("origin", "https://admin.example.test");
    duplicateOrigin.append("origin", "https://admin.example.test");

    const duplicateFetchSite = new Headers({
      origin: "https://admin.example.test",
      "content-type": "application/json",
    });
    duplicateFetchSite.append("sec-fetch-site", "same-origin");
    duplicateFetchSite.append("sec-fetch-site", "same-origin");

    for (const headers of [duplicateOrigin, duplicateFetchSite]) {
      expect(() =>
        requireTrustedJsonMutation(
          unreadableRequest(headers),
          AUTH_ENVIRONMENT,
        ),
      ).toThrowError(MutationRequestError);
    }
  });

  it.each([
    undefined,
    "text/plain",
    "application/json-patch+json",
    "application/json; charset=iso-8859-1",
    "application/json; profile=anything",
    "application/json; charset=utf-8; charset=utf-8",
    "application/json, application/json",
  ])(
    "rejects a missing, duplicate or non-exact JSON content type %s",
    (value) => {
      const headers = new Headers({ origin: "https://admin.example.test" });
      if (value !== undefined) headers.set("content-type", value);

      expect(() =>
        requireTrustedJsonMutation(
          unreadableRequest(headers),
          AUTH_ENVIRONMENT,
        ),
      ).toThrowError(MutationRequestError);
    },
  );

  it("maps header access failures to the same fixed request error", () => {
    const request = {
      headers: {
        get(): never {
          throw new Error("secret header implementation detail");
        },
      },
    } as unknown as Request;

    expect(() =>
      requireTrustedJsonMutation(request, AUTH_ENVIRONMENT),
    ).toThrowError(
      expect.objectContaining({
        code: "MUTATION_REQUEST_REJECTED",
        message: "Mutation request rejected",
      }),
    );
  });

  it.each([
    { environment: {}, privateField: "BETTER_AUTH_SECRET" },
    {
      environment: {
        ...AUTH_ENVIRONMENT,
        BETTER_AUTH_TRUSTED_ORIGINS:
          "https://admin.example.test/private-config-path",
      },
      privateField: "BETTER_AUTH_TRUSTED_ORIGINS",
    },
  ] as const)(
    "maps auth environment resolution failure without leaking $privateField",
    ({ environment, privateField }) => {
      const headers = new Headers({
        origin: "https://admin.example.test",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      });

      let caught: unknown;
      try {
        requireTrustedJsonMutation(
          unreadableRequest(headers),
          environment as AuthEnvironment,
        );
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(MutationRequestError);
      expect(caught).toMatchObject({
        code: "MUTATION_REQUEST_REJECTED",
        message: "Mutation request rejected",
      });
      expect(
        `${String(caught)}\n${caught instanceof Error ? caught.stack : ""}`,
      ).not.toContain(privateField);
    },
  );
});
