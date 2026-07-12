import { resendVerificationAction } from "@/server/registration/actions";

import { createEmailVerificationResendHandler } from "./handler";

export const POST = createEmailVerificationResendHandler(
  resendVerificationAction,
);
