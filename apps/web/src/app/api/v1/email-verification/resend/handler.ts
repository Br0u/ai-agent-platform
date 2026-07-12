import "server-only";

import type { EmailVerificationResult } from "@ai-agent-platform/integrations";

type Resend = () => Promise<EmailVerificationResult>;

export function createEmailVerificationResendHandler(resend: Resend) {
  return async function POST(): Promise<Response> {
    const result = await resend();
    if (!result.ok)
      return Response.json(
        { error: { code: result.code } },
        { status: result.status, headers: { "Cache-Control": "no-store" } },
      );
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  };
}
