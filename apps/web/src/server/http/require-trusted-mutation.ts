import "server-only";

import {
  resolveAuthEnvironment,
  type AuthEnvironment,
} from "../auth/shared-options";

const JSON_CONTENT_TYPE =
  /^application\/json[\t ]*(?:;[\t ]*charset[\t ]*=[\t ]*(?:utf-8|"utf-8")[\t ]*)?$/iu;

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

export function requireTrustedJsonMutation(
  request: Request,
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
      !JSON_CONTENT_TYPE.test(contentType)
    ) {
      rejectMutation();
    }
  } catch (error) {
    if (error instanceof MutationRequestError) throw error;
    rejectMutation();
  }
}
