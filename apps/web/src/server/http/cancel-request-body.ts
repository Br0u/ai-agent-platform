export async function cancelUnreadRequestBody(
  request: Pick<Request, "body">,
  reason?: unknown,
): Promise<void> {
  try {
    const body = request.body;
    if (body === null || body.locked) return;
    await body.cancel(reason);
  } catch {
    // Cleanup must never replace the request's primary error.
  }
}
