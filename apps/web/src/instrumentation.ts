export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NODE_ENV !== "production"
  ) {
    return;
  }
  const { resolveAssistantPublicOrigin } = await import(
    "@/server/assistant/assistant-public-origin"
  );
  resolveAssistantPublicOrigin(process.env);
}
