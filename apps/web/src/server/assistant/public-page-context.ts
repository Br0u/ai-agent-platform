import "server-only";

import { createRequire } from "node:module";

import { matchRoute } from "@/config/routes";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (
    html: string,
    options: { url: string },
  ) => {
    window: {
      document: Document;
      getComputedStyle(element: Element): CSSStyleDeclaration;
    };
  };
};

export const PUBLIC_PAGE_REQUEST_TIMEOUT_MS = 1_500;
export const PUBLIC_PAGE_DESTINATION_DEADLINE_MS = 2_000;
export const PUBLIC_PAGE_BODY_MAX_BYTES = 512 * 1024;
export const PUBLIC_PAGE_SEARCH_MAX_CODE_POINTS = 1_024;
export const PUBLIC_PAGE_QUERY_KEYS_MAX = 8;
export const PUBLIC_PAGE_QUERY_KEY_MAX_CODE_POINTS = 64;
export const PUBLIC_PAGE_QUERY_VALUE_MAX_CODE_POINTS = 256;
export const PUBLIC_PAGE_TITLE_MAX_CODE_POINTS = 200;
export const PUBLIC_PAGE_TEXT_MAX_CODE_POINTS = 12_000;
export const PUBLIC_PAGE_LINKS_MAX = 16;
export const PUBLIC_PAGE_DESTINATION_CONCURRENCY = 4;

const EXCLUDED_PUBLIC_PATHS = new Set([
  "/assistant",
  "/contact",
  "/login",
  "/register",
  "/staff/change-password",
  "/staff/login",
  "/trial",
]);

const REMOVED_CONTENT_SELECTOR = [
  "script",
  "style",
  "template",
  "noscript",
  "form",
  "input",
  "textarea",
  "select",
  "button",
  "[hidden]",
  "[inert]",
  '[aria-hidden="true"]',
  "[data-assistant-background-root]",
  '[data-testid^="assistant-"]',
  ".assistant-workspace",
  ".assistant-conversation",
  ".floating-assistant",
].join(",");

export type PublicPageLink = {
  label: string;
  href: string;
};

export type PublicPageContext = {
  pathname: string;
  search: string;
  title: string;
  text: string;
  links: PublicPageLink[];
};

type PublicPageContextResolverOptions = {
  origin: URL;
  fetch: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
};

type CandidateLink = PublicPageLink & { pathname: string; search: string };

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function truncateCodePoints(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join("");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function isNormalizedPathname(pathname: string): boolean {
  if (
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.includes("\\") ||
    pathname.includes("?") ||
    pathname.includes("#") ||
    /[\u0000-\u001f\u007f]/u.test(pathname)
  ) {
    return false;
  }
  try {
    const decoded = decodeURIComponent(pathname);
    if (
      /[\\?#\u0000-\u001f\u007f]/u.test(decoded) ||
      decoded
        .split("/")
        .some((segment) => segment === "." || segment === "..") ||
      /%(?:2f|5c|3f|23|2e|0[0-9a-f]|1[0-9a-f]|7f)/iu.test(decoded) ||
      (pathname !== decoded && pathname !== encodeURI(decoded))
    ) {
      return false;
    }
    const base = new URL("https://public-page.invalid");
    const parsed = new URL(pathname, base);
    return (
      parsed.origin === base.origin &&
      parsed.search === "" &&
      parsed.hash === "" &&
      (parsed.pathname === pathname || parsed.pathname === encodeURI(pathname))
    );
  } catch {
    return false;
  }
}

function hasAmbiguousRawPath(value: string): boolean {
  const path = value.split(/[?#]/u, 1)[0] ?? "";
  return (
    /%(?![0-9a-f]{2})/iu.test(path) ||
    /%(?:2f|5c|3f|23|2e|0[0-9a-f]|1[0-9a-f]|7f)/iu.test(path) ||
    /(?:^|\/)\.{1,2}(?:\/|$)/u.test(path)
  );
}

function isAllowedPublicPath(pathname: string): boolean {
  if (!isNormalizedPathname(pathname) || EXCLUDED_PUBLIC_PATHS.has(pathname)) {
    return false;
  }
  const route = matchRoute(pathname);
  return route?.group === "public" && route.status === "live";
}

export { isAllowedPublicPath as isAllowedAssistantPublicPath };

function isValidSearch(search: string): boolean {
  if (
    codePointLength(search) > PUBLIC_PAGE_SEARCH_MAX_CODE_POINTS ||
    (search !== "" && !search.startsWith("?")) ||
    search.includes("#") ||
    /[\u0000-\u001f\u007f]/u.test(search)
  ) {
    return false;
  }
  let parameters: URLSearchParams;
  try {
    if (
      new URL(`/safe${search}`, "https://public-page.invalid").search !== search
    ) {
      return false;
    }
    parameters = new URLSearchParams(search);
  } catch {
    return false;
  }
  const keys = new Set<string>();
  for (const [key, value] of parameters) {
    if (
      keys.has(key) ||
      codePointLength(key) > PUBLIC_PAGE_QUERY_KEY_MAX_CODE_POINTS ||
      codePointLength(value) > PUBLIC_PAGE_QUERY_VALUE_MAX_CODE_POINTS ||
      /[\u0000-\u001f\u007f]/u.test(key) ||
      /[\u0000-\u001f\u007f]/u.test(value)
    ) {
      return false;
    }
    keys.add(key);
    if (keys.size > PUBLIC_PAGE_QUERY_KEYS_MAX) return false;
  }
  return true;
}

function isHtml(response: Response): boolean {
  return (
    response.status === 200 &&
    /^text\/html(?:\s*;|\s*$)/iu.test(
      response.headers.get("content-type") ?? "",
    )
  );
}

function safeRedirectTarget(
  response: Response,
  current: URL,
  origin: URL,
): URL | null {
  if (![301, 302, 303, 307, 308].includes(response.status)) return null;
  const location = response.headers.get("location");
  if (!location || hasAmbiguousRawPath(location)) return null;
  try {
    const target = new URL(location, current);
    return target.origin === origin.origin &&
      target.username === "" &&
      target.password === "" &&
      target.hash === "" &&
      isAllowedPublicPath(target.pathname) &&
      isValidSearch(target.search)
      ? target
      : null;
  } catch {
    return null;
  }
}

function fixedOrigin(optionsOrigin: URL): URL {
  const origin = new URL(optionsOrigin.toString());
  if (
    origin.toString() !== `${origin.origin}/` ||
    origin.username !== "" ||
    origin.password !== ""
  ) {
    throw new TypeError("origin must be an exact URL origin");
  }
  return origin;
}

function createRequestSignal(
  caller: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, Math.max(1, timeoutMs));
  caller?.addEventListener("abort", abort, { once: true });
  if (caller?.aborted) abort();
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      caller?.removeEventListener("abort", abort);
    },
  };
}

async function anonymousGet(
  fetcher: typeof fetch,
  url: URL,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{
  response: Response;
  signal: AbortSignal;
  dispose(): void;
} | null> {
  if (signal?.aborted) return null;
  const requestSignal = createRequestSignal(signal, timeoutMs);
  try {
    const response = await Promise.race([
      fetcher(url, {
        method: "GET",
        credentials: "omit",
        redirect: "manual",
        signal: requestSignal.signal,
      }),
      new Promise<null>((resolve) =>
        requestSignal.signal.addEventListener("abort", () => resolve(null), {
          once: true,
        }),
      ),
    ]);
    if (!response) {
      requestSignal.dispose();
      return null;
    }
    return { response, ...requestSignal };
  } catch {
    requestSignal.dispose();
    return null;
  }
}

async function cancelBody(response: Response): Promise<void> {
  void response.body?.cancel().catch(() => undefined);
}

async function readBoundedHtml(
  response: Response,
  maximum: number,
  signal: AbortSignal,
): Promise<string | null> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximum) {
    await cancelBody(response);
    return null;
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const abort = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) return null;
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximum) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    if (signal.aborted) return null;
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    try {
      await reader.cancel();
    } catch {
      // The stream already failed.
    }
    return null;
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

function extractPage(
  rawHtml: string,
  url: URL,
  origin: URL,
): (Omit<PublicPageContext, "links"> & { candidates: CandidateLink[] }) | null {
  let dom: InstanceType<typeof JSDOM>;
  try {
    dom = new JSDOM(rawHtml, { url: url.toString() });
  } catch {
    return null;
  }
  const { document } = dom.window;
  const root = document.querySelector("main") ?? document.body;
  if (!root) return null;
  for (const node of [root, ...root.querySelectorAll("*")]) {
    const style = dom.window.getComputedStyle(node);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    ) {
      if (node === root) root.replaceChildren();
      else node.remove();
    }
  }
  root
    .querySelectorAll(REMOVED_CONTENT_SELECTOR)
    .forEach((node) => node.remove());
  root.querySelectorAll<HTMLElement>("[style]").forEach((node) => {
    if (node.style.display === "none" || node.style.visibility === "hidden") {
      node.remove();
    }
  });

  const seen = new Set<string>();
  const candidates: CandidateLink[] = [];
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (candidates.length >= PUBLIC_PAGE_LINKS_MAX) break;
    let destination: URL;
    const rawHref = anchor.getAttribute("href") ?? "";
    if (hasAmbiguousRawPath(rawHref)) continue;
    try {
      destination = new URL(rawHref, url);
    } catch {
      continue;
    }
    if (
      destination.origin !== origin.origin ||
      !isAllowedPublicPath(destination.pathname) ||
      !isValidSearch(destination.search) ||
      seen.has(`${destination.pathname}${destination.search}`)
    ) {
      continue;
    }
    const label = truncateCodePoints(
      normalizeText(anchor.textContent ?? "") ||
        matchRoute(destination.pathname)?.title ||
        destination.pathname,
      PUBLIC_PAGE_TITLE_MAX_CODE_POINTS,
    );
    const href = `${destination.pathname}${destination.search}`;
    seen.add(href);
    candidates.push({
      pathname: destination.pathname,
      search: destination.search,
      href,
      label,
    });
  }
  return {
    pathname: url.pathname,
    search: url.search,
    title: truncateCodePoints(
      normalizeText(document.title),
      PUBLIC_PAGE_TITLE_MAX_CODE_POINTS,
    ),
    text: truncateCodePoints(
      normalizeText(root.textContent ?? ""),
      PUBLIC_PAGE_TEXT_MAX_CODE_POINTS,
    ),
    candidates,
  };
}

export function createPublicPageContextResolver(
  options: PublicPageContextResolverOptions,
) {
  const origin = fixedOrigin(options.origin);
  const timeoutMs = options.timeoutMs ?? PUBLIC_PAGE_REQUEST_TIMEOUT_MS;
  const destinationDeadlineMs = PUBLIC_PAGE_DESTINATION_DEADLINE_MS;
  const maxBytes = options.maxBytes ?? PUBLIC_PAGE_BODY_MAX_BYTES;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("timeoutMs must be positive");
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("maxBytes must be a positive integer");
  }

  async function headerExists(
    pathname: string,
    search: string,
    signal: AbortSignal | undefined,
    requestTimeoutMs = timeoutMs,
  ): Promise<boolean> {
    if (!isAllowedPublicPath(pathname) || !isValidSearch(search)) return false;
    const request = await anonymousGet(
      options.fetch,
      new URL(`${pathname}${search}`, origin),
      requestTimeoutMs,
      signal,
    );
    if (!request) return false;
    try {
      const accepted = isHtml(request.response);
      await cancelBody(request.response);
      return accepted;
    } finally {
      request.dispose();
    }
  }

  return {
    async exists(pathname: string, signal?: AbortSignal): Promise<boolean> {
      return headerExists(pathname, "", signal);
    },

    async load(
      input: { pathname: string; search: string },
      signal?: AbortSignal,
    ): Promise<PublicPageContext | null> {
      if (
        !isAllowedPublicPath(input.pathname) ||
        !isValidSearch(input.search) ||
        signal?.aborted
      ) {
        return null;
      }
      let url = new URL(`${input.pathname}${input.search}`, origin);
      let request = await anonymousGet(options.fetch, url, timeoutMs, signal);
      if (!request) return null;
      let response = request.response;
      if (!isHtml(response)) {
        const target = safeRedirectTarget(response, url, origin);
        try {
          await cancelBody(response);
        } finally {
          request.dispose();
        }
        if (!target) return null;
        url = target;
        request = await anonymousGet(options.fetch, url, timeoutMs, signal);
        if (!request) return null;
        response = request.response;
        if (!isHtml(response)) {
          try {
            await cancelBody(response);
            return null;
          } finally {
            request.dispose();
          }
        }
      }
      let rawHtml: string | null;
      try {
        rawHtml = await readBoundedHtml(response, maxBytes, request.signal);
      } finally {
        request.dispose();
      }
      if (rawHtml === null) return null;
      const extracted = extractPage(rawHtml, url, origin);
      if (!extracted) return null;

      const deadline = Date.now() + destinationDeadlineMs;
      const candidates = extracted.candidates;
      const links: Array<PublicPageLink | undefined> = new Array(
        candidates.length,
      );
      let nextIndex = 0;
      async function worker() {
        while (nextIndex < candidates.length) {
          const index = nextIndex;
          nextIndex += 1;
          const remaining = deadline - Date.now();
          if (remaining <= 0 || signal?.aborted) return;
          const candidate = candidates[index];
          if (
            candidate &&
            (await headerExists(
              candidate.pathname,
              candidate.search,
              signal,
              Math.min(timeoutMs, remaining),
            ))
          ) {
            links[index] = {
              href: candidate.href,
              label: candidate.label,
            };
          }
        }
      }
      await Promise.all(
        Array.from(
          {
            length: Math.min(
              PUBLIC_PAGE_DESTINATION_CONCURRENCY,
              candidates.length,
            ),
          },
          () => worker(),
        ),
      );
      return {
        pathname: extracted.pathname,
        search: extracted.search,
        title: extracted.title,
        text: extracted.text,
        links: links.filter(
          (link): link is PublicPageLink => link !== undefined,
        ),
      };
    },
  };
}

export type PublicPageContextResolver = ReturnType<
  typeof createPublicPageContextResolver
>;
