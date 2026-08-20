import "server-only";

import type {
  AssistantProvider,
  AssistantProviderEvent,
  AssistantProviderInvocation,
  AssistantProviderReply,
} from "./assistant-provider";
import { isAssistantNavigationIntent } from "./assistant-provider";
import { industrySolutionCatalog } from "@/components/solution-industry-content";
import { portalNavigation } from "@/config/navigation";
import { matchRoute, routeRegistry } from "@/config/routes";
import { AssistantContentFilter } from "./assistant-content-filter";
import type { AgentOSExecutionCircuit } from "./agentos-execution-circuit";
import {
  AgentOSRunClientError,
  type AgentOSRunClient,
  type AgentOSRunClientErrorCode,
  type AgentOSRunDiagnostic,
} from "./agentos-run-client";

type PublicSiteCatalogEntry = {
  label: string;
  href: string;
  description?: string;
};

const publicSiteCatalogByHref = new Map<string, PublicSiteCatalogEntry>();
for (const entry of [
  ...portalNavigation.flatMap((navigation) => [
    {
      label: navigation.label,
      href: navigation.href,
      ...(navigation.description
        ? { description: navigation.description }
        : {}),
    },
    ...navigation.children.flatMap((section) =>
      section.items.flatMap((item) =>
        "href" in item && item.href
          ? [
              {
                label: item.label,
                href: item.href,
                ...(item.description
                  ? { description: item.description }
                  : {}),
              },
            ]
          : [],
      ),
    ),
  ]),
  ...routeRegistry.flatMap((route) =>
    route.group === "public" &&
    route.status === "live" &&
    !route.path.includes("[")
      ? [{ label: route.title, href: route.path }]
      : [],
  ),
  ...industrySolutionCatalog.map((solution) => ({
    label: solution.name,
    href: `/solutions/${solution.key}`,
    description: solution.value,
  })),
]) {
  publicSiteCatalogByHref.set(entry.href, entry);
}
const PUBLIC_SITE_CATALOG = [...publicSiteCatalogByHref.values()];
const PUBLIC_SITE_LINKS = PUBLIC_SITE_CATALOG.map(({ label, href }) => ({
  label,
  href,
}));

export type AgentOSRunFailureEvent = {
  code: AgentOSRunClientErrorCode | "unexpected";
  diagnostic: AgentOSRunDiagnostic | null;
};

export type AgentOSRunFailureRecorder = (event: AgentOSRunFailureEvent) => void;

export const defaultAgentOSRunFailureRecorder: AgentOSRunFailureRecorder = (
  event,
) => {
  try {
    console.warn("Assistant AgentOS run failed", {
      code: event.code,
      diagnostic: event.diagnostic,
    });
  } catch {
    // Observability must never replace the original run failure.
  }
};

export class AgentOSAssistantProvider implements AssistantProvider {
  constructor(
    private readonly options: {
      runClient: AgentOSRunClient;
      circuit: AgentOSExecutionCircuit;
      pageResolver: {
        exists(pathname: string, signal?: AbortSignal): Promise<boolean>;
      };
      runFailureRecorder?: AgentOSRunFailureRecorder;
    },
  ) {}

  private async *runStream(
    invocation: AssistantProviderInvocation,
  ): AsyncIterable<AssistantProviderEvent> {
    let requestedNavigation = requestedNavigationPath(invocation);
    if (requestedNavigation !== null) {
      const route = matchRoute(navigationPathname(requestedNavigation));
      if (route?.group === "public" && route.status === "live") {
        const action = await this.validatedNavigation(
          requestedNavigation,
          invocation.signal,
        );
        if (action !== null) {
          yield {
            type: "answer_delta",
            content: `可以，点击下方“${route.title}”前往。`,
          };
          yield action;
          return;
        }
        requestedNavigation = null;
      }
    }
    const message = buildAssistantPrompt(invocation);
    const iterator = this.options.runClient
      .runAgentStream({
        message,
        ...(invocation.signal ? { signal: invocation.signal } : {}),
      })
      [Symbol.asyncIterator]();
    type QueueItem =
      | {
          kind: "chunk";
          value: Awaited<ReturnType<typeof iterator.next>>["value"];
        }
      | { kind: "done" }
      | { kind: "error"; error: unknown };
    const queue: QueueItem[] = [];
    let wake: (() => void) | null = null;
    const push = (item: QueueItem) => {
      queue.push(item);
      wake?.();
      wake = null;
    };
    const take = async (): Promise<QueueItem> => {
      while (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      return queue.shift()!;
    };
    const execution = this.options.circuit.execute(async () => {
      try {
        while (true) {
          const next = await iterator.next();
          if (next.done) return;
          push({ kind: "chunk", value: next.value });
        }
      } catch (error) {
        this.recordRunFailure(error);
        throw error;
      }
    });
    void execution.then(
      () => push({ kind: "done" }),
      (error: unknown) => push({ kind: "error", error }),
    );
    const filter = new AssistantContentFilter();
    const seenActions = new Set<string>();
    const pendingActions: AssistantProviderEvent[] = [];
    let hasSafeAnswer = false;
    try {
      while (true) {
        const item = await take();
        if (item.kind === "done") {
          const tail = filter.finish();
          if (tail) {
            hasSafeAnswer ||= tail.trim().length > 0;
            yield { type: "answer_delta", content: tail };
          }
          if (!hasSafeAnswer) {
            const error = new AgentOSRunClientError(
              "invalid_response",
              "stream_empty_content",
            );
            this.recordRunFailure(error);
            throw error;
          }
          for (const action of pendingActions) yield action;
          if (
            requestedNavigation !== null &&
            !seenActions.has(requestedNavigation)
          ) {
            const action = await this.validatedNavigation(
              requestedNavigation,
              invocation.signal,
            );
            if (action !== null) yield action;
          }
          return;
        }
        if (item.kind === "error") throw item.error;
        const event = item.value;
        if (event.type === "answer_delta") {
          const content = filter.push(event.content);
          if (content) {
            hasSafeAnswer ||= content.trim().length > 0;
            yield { type: "answer_delta", content };
          }
        } else if (event.type === "activity") {
          yield event.phase === "analyzing"
            ? { type: "activity", phase: "analyzing", label: "正在分析问题" }
            : {
                type: "activity",
                phase: "tool",
                label:
                  event.toolName === "suggest_navigation"
                    ? "正在检查页面入口"
                    : "正在使用工具",
              };
        } else if (!seenActions.has(event.pathname)) {
          seenActions.add(event.pathname);
          const action = await this.validatedNavigation(
            event.pathname,
            invocation.signal,
          );
          if (action !== null) pendingActions.push(action);
        }
      }
    } finally {
      await iterator.return?.();
      await execution.catch(() => undefined);
    }
  }

  private async validatedNavigation(
    pathname: string,
    signal?: AbortSignal,
  ): Promise<AssistantProviderEvent | null> {
    const routePathname = navigationPathname(pathname);
    const route = matchRoute(routePathname);
    if (
      route?.group !== "public" ||
      route.status !== "live" ||
      !(await this.options.pageResolver.exists(routePathname, signal))
    ) {
      return null;
    }
    return {
      type: "action",
      action: { kind: "navigate", pathname, label: route.title },
    };
  }

  private recordRunFailure(error: unknown): void {
    const event: AgentOSRunFailureEvent =
      error instanceof AgentOSRunClientError
        ? {
            code: error.code,
            diagnostic: error.diagnostic ?? null,
          }
        : { code: "unexpected", diagnostic: null };
    try {
      (this.options.runFailureRecorder ?? defaultAgentOSRunFailureRecorder)(
        event,
      );
    } catch {
      // Failure recording cannot replace the original run error.
    }
  }

  async *streamReply(
    invocation: AssistantProviderInvocation,
  ): AsyncIterable<AssistantProviderEvent> {
    yield* this.runStream(invocation);
  }

  async reply(
    invocation: AssistantProviderInvocation,
  ): Promise<AssistantProviderReply> {
    let content = "";
    const suggestedActions = [];
    for await (const event of this.streamReply(invocation)) {
      if (event.type === "answer_delta") content += event.content;
      if (event.type === "action") {
        suggestedActions.push({
          label: event.action.label,
          href: event.action.pathname,
        });
      }
    }
    return { content, suggestedActions };
  }
}

function requestedNavigationPath(
  invocation: AssistantProviderInvocation,
): string | null {
  const compactMessage = invocation.request.message.replace(/\s+/gu, "");
  const matches = [
    ...(invocation.pageContext?.links ?? []),
    ...PUBLIC_SITE_LINKS,
  ]
    .filter((link) => {
      const label = link.label.replace(/[\s→›»]+/gu, "");
      const routeTitle = matchingRouteTitle(link.href);
      return (
        (label.length >= 2 && compactMessage.includes(label)) ||
        (routeTitle !== undefined &&
          routeTitle.length >= 2 &&
          compactMessage.includes(routeTitle))
      );
    })
    .sort((left, right) => right.label.length - left.label.length);
  if (!isAssistantNavigationIntent(invocation.request.message)) {
    return (
      matches.find((link) => isConciseGoRequest(compactMessage, link))?.href ??
      null
    );
  }
  return matches[0]?.href ?? null;
}

function isConciseGoRequest(
  compactMessage: string,
  link: { label: string; href: string },
): boolean {
  const label = link.label.replace(/[\s→›»]+/gu, "");
  const routeTitle = matchingRouteTitle(link.href);
  return [label, routeTitle].some(
    (destination) =>
      destination !== undefined &&
      ["去", "请去", "帮我去", "请帮我去", "导航去"].some((prefix) =>
        compactMessage.startsWith(`${prefix}${destination}`),
      ),
  );
}

function matchingRouteTitle(href: string): string | undefined {
  const route = matchRoute(navigationPathname(href));
  return route !== undefined && !route.path.includes("[")
    ? route.title.replace(/(?:介绍|中心|详情|页面)$/u, "")
    : undefined;
}

function navigationPathname(href: string): string {
  return href.split(/[?#]/u, 1)[0] ?? "";
}

function buildAssistantPrompt(invocation: AssistantProviderInvocation): string {
  return `服务器提供的助手上下文 JSON：\n${JSON.stringify({
    currentPage: invocation.pageContext,
    publicSiteCatalog: PUBLIC_SITE_CATALOG,
    history: invocation.request.history,
    userQuestion: invocation.request.message,
  })}`;
}
