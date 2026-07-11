import "server-only";

import {
  AuthAccessError,
  authAccessErrorBody,
  createAccessService,
  toStaffSessionDto,
  type StaffSessionDto,
} from "@/server/auth/access";

const COOKIE_NAME = "aap_staff_session";
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

type StaffSessionLoader = (headers: Headers) => Promise<StaffSessionDto>;

function hasExactCookie(headers: Headers, name: string): boolean {
  return (headers.get("cookie") ?? "").split(";").some((part) => {
    const separator = part.indexOf("=");
    return separator > 0 && part.slice(0, separator).trim() === name;
  });
}

function errorResponse(
  code: string,
  message: string,
  status: number,
): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: NO_STORE_HEADERS },
  );
}

const defaultLoader: StaffSessionLoader = async (requestHeaders) => {
  const access = createAccessService({
    getHeaders: async () => requestHeaders,
  });
  return toStaffSessionDto(await access.requireWorkforce());
};

export function createStaffSessionHandler(loadSession: StaffSessionLoader) {
  return async function GET(request: Request): Promise<Response> {
    if (!hasExactCookie(request.headers, COOKIE_NAME)) {
      return errorResponse(
        "AUTH_SESSION_REQUIRED",
        "Authentication required",
        401,
      );
    }

    try {
      return Response.json(await loadSession(request.headers), {
        headers: NO_STORE_HEADERS,
      });
    } catch (error) {
      if (error instanceof AuthAccessError) {
        return Response.json(authAccessErrorBody(error), {
          status: error.status,
          headers: NO_STORE_HEADERS,
        });
      }
      return errorResponse(
        "AUTH_UNEXPECTED_ERROR",
        "Authentication request failed",
        500,
      );
    }
  };
}

export const GET = createStaffSessionHandler(defaultLoader);
