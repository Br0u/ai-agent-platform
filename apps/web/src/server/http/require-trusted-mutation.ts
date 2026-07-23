import "server-only";

import {
  resolveAuthEnvironment,
  type AuthEnvironment,
} from "../auth/shared-options";

const JSON_CONTENT_TYPE =
  /^application\/json[\t ]*(?:;[\t ]*charset[\t ]*=[\t ]*(?:utf-8|"utf-8")[\t ]*)?$/iu;
const MULTIPART_CONTENT_TYPE =
  /^multipart\/form-data[\t ]*;[\t ]*boundary=(?:"[!#$%&'*+.^_`|~0-9A-Za-z-]{1,70}"|[!#$%&'*+.^_`|~0-9A-Za-z-]{1,70})$/u;

export class MutationRequestError extends Error {
  readonly code = "MUTATION_REQUEST_REJECTED";

  constructor() {
    super("Mutation request rejected");
    this.name = "MutationRequestError";
  }
}

function rejectMutation(): never {
  throw new MutationRequestError();
}

function requireTrustedMutation(
  request: Request,
  contentTypePattern: RegExp,
  environment: AuthEnvironment = process.env,
): void {
  try {
    const trustedOrigins = new Set(
      resolveAuthEnvironment(environment).trustedOrigins,
    );
    const origin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");
    const contentType = request.headers.get("content-type");

    if (
      origin === null ||
      !trustedOrigins.has(origin) ||
      (fetchSite !== null && fetchSite !== "same-origin") ||
      contentType === null ||
      !contentTypePattern.test(contentType)
    ) {
      rejectMutation();
    }
  } catch (error) {
    if (error instanceof MutationRequestError) throw error;
    rejectMutation();
  }
}

export function requireTrustedJsonMutation(
  request: Request,
  environment: AuthEnvironment = process.env,
): void {
  requireTrustedMutation(request, JSON_CONTENT_TYPE, environment);
}

export function requireTrustedMultipartMutation(
  request: Request,
  environment: AuthEnvironment = process.env,
): void {
  requireTrustedMutation(request, MULTIPART_CONTENT_TYPE, environment);
}
