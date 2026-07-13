import { placeholderAssistantProvider } from "@/server/assistant/assistant-provider";

const invalidMessageResponse = () =>
  Response.json(
    {
      mode: "placeholder",
      error: {
        code: "invalid_message",
        message: "请输入 1 至 500 个字符的问题。",
      },
    },
    { status: 400 },
  );

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return invalidMessageResponse();
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("message" in body) ||
    typeof body.message !== "string"
  ) {
    return invalidMessageResponse();
  }

  const message = body.message.trim();
  if (message.length === 0 || Array.from(message).length > 500) {
    return invalidMessageResponse();
  }

  try {
    return Response.json(await placeholderAssistantProvider.reply(message));
  } catch {
    return Response.json(
      {
        mode: "placeholder",
        error: {
          code: "assistant_unavailable",
          message: "助手服务暂时不可用，请使用帮助中心或商务咨询。",
        },
      },
      { status: 503 },
    );
  }
}
