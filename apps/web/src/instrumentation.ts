export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build"
  ) {
    return;
  }

  const { validateAnonymousSessionRuntimeConfig } = await import(
    "@/server/assistant/anonymous-session-config"
  );
  try {
    validateAnonymousSessionRuntimeConfig();
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Assistant session runtime configuration is invalid",
    );
    process.exit(1);
  }
}
