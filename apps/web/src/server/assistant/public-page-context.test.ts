import { describe, expect, it, vi } from "vitest";

import {
  PUBLIC_PAGE_BODY_MAX_BYTES,
  PUBLIC_PAGE_DESTINATION_CONCURRENCY,
  PUBLIC_PAGE_DESTINATION_DEADLINE_MS,
  PUBLIC_PAGE_LINKS_MAX,
  PUBLIC_PAGE_QUERY_KEY_MAX_CODE_POINTS,
  PUBLIC_PAGE_QUERY_KEYS_MAX,
  PUBLIC_PAGE_QUERY_VALUE_MAX_CODE_POINTS,
  PUBLIC_PAGE_REQUEST_TIMEOUT_MS,
  PUBLIC_PAGE_SEARCH_MAX_CODE_POINTS,
  PUBLIC_PAGE_TEXT_MAX_CODE_POINTS,
  PUBLIC_PAGE_TITLE_MAX_CODE_POINTS,
  createPublicPageContextResolver,
} from "./public-page-context";

const ORIGIN = new URL("https://portal.example.com");

function html(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });
}

function resolver(fetcher: typeof fetch) {
  return createPublicPageContextResolver({ origin: ORIGIN, fetch: fetcher });
}

describe("public page context resolver", () => {
  it("exports the fixed production bounds", () => {
    expect({
      requestTimeout: PUBLIC_PAGE_REQUEST_TIMEOUT_MS,
      destinationDeadline: PUBLIC_PAGE_DESTINATION_DEADLINE_MS,
      bodyBytes: PUBLIC_PAGE_BODY_MAX_BYTES,
      search: PUBLIC_PAGE_SEARCH_MAX_CODE_POINTS,
      queryKeys: PUBLIC_PAGE_QUERY_KEYS_MAX,
      queryKey: PUBLIC_PAGE_QUERY_KEY_MAX_CODE_POINTS,
      queryValue: PUBLIC_PAGE_QUERY_VALUE_MAX_CODE_POINTS,
      title: PUBLIC_PAGE_TITLE_MAX_CODE_POINTS,
      text: PUBLIC_PAGE_TEXT_MAX_CODE_POINTS,
      links: PUBLIC_PAGE_LINKS_MAX,
      concurrency: PUBLIC_PAGE_DESTINATION_CONCURRENCY,
    }).toEqual({
      requestTimeout: 1_500,
      destinationDeadline: 2_000,
      bodyBytes: 512 * 1024,
      search: 1_024,
      queryKeys: 8,
      queryKey: 64,
      queryValue: 256,
      title: 200,
      text: 12_000,
      links: 64,
      concurrency: 4,
    });
  });

  it("uses only the configured origin and an anonymous redirect-free GET", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      html("<title>产品</title><main>公开正文</main>"),
    );

    await expect(
      resolver(fetcher).load({ pathname: "/product", search: "?tab=agent" }),
    ).resolves.toMatchObject({ title: "产品", text: "公开正文" });

    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      new URL("https://portal.example.com/product?tab=agent"),
      expect.objectContaining({
        method: "GET",
        redirect: "manual",
        credentials: "omit",
      }),
    );
    const init = fetcher.mock.calls[0]?.[1];
    expect(init).not.toHaveProperty("headers");
  });

  it.each([
    ["assistant", "/assistant"],
    ["login", "/login"],
    ["registration", "/register"],
    ["staff auth", "/staff/login"],
    ["public credential form", "/trial"],
    ["admin", "/admin/assistant"],
    ["console", "/console/onboarding"],
    ["scaffold", "/docs"],
    ["unknown", "/not-registered"],
  ])("rejects %s before fetch", async (_name, pathname) => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      resolver(fetcher).load({ pathname, search: "" }),
    ).resolves.toBeNull();
    await expect(resolver(fetcher).exists(pathname)).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["%2f", "%5c", "%00", "%2e%2e", "%zz"])(
    "rejects ambiguous encoded dynamic path %s before fetch",
    async (segment) => {
      const fetcher = vi.fn<typeof fetch>();
      const pathname = `/solutions/${segment}`;
      const current = resolver(fetcher);

      await expect(current.load({ pathname, search: "" })).resolves.toBeNull();
      await expect(current.exists(pathname)).resolves.toBe(false);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["404", new Response("missing", { status: 404 })],
    [
      "redirect",
      new Response(null, { status: 302, headers: { location: "/product" } }),
    ],
    ["JSON", Response.json({ private: true })],
    ["HTML without exact 200", html("<main>no</main>", { status: 201 })],
  ])(
    "accepts only an actual 200 text/html response: %s",
    async (_name, response) => {
      const fetcher = vi.fn<typeof fetch>(async () => response.clone());

      await expect(
        resolver(fetcher).load({ pathname: "/solutions/missing", search: "" }),
      ).resolves.toBeNull();
      await expect(
        resolver(fetcher).exists("/solutions/missing"),
      ).resolves.toBe(false);
    },
  );

  it("accepts exact query bounds and rejects every one-over or duplicate form", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => html("<main>ok</main>"));
    const current = resolver(fetcher);
    const exactPairs = Array.from(
      { length: PUBLIC_PAGE_QUERY_KEYS_MAX },
      (_, index) => `k${index}=${"a".repeat(124)}`,
    );
    const exactSearch = `?${exactPairs.join("&")}`;
    expect(Array.from(exactSearch)).toHaveLength(
      PUBLIC_PAGE_SEARCH_MAX_CODE_POINTS,
    );

    await expect(
      current.load({ pathname: "/product", search: exactSearch }),
    ).resolves.not.toBeNull();

    const invalid = [
      `?${"k".repeat(PUBLIC_PAGE_QUERY_KEY_MAX_CODE_POINTS + 1)}=v`,
      `?k=${"😀".repeat(PUBLIC_PAGE_QUERY_VALUE_MAX_CODE_POINTS + 1)}`,
      `?${Array.from({ length: PUBLIC_PAGE_QUERY_KEYS_MAX + 1 }, (_, index) => `k${index}=v`).join("&")}`,
      "?same=one&same=two",
      `?${"a".repeat(PUBLIC_PAGE_SEARCH_MAX_CODE_POINTS)}`,
    ];
    for (const search of invalid) {
      await expect(
        current.load({ pathname: "/product", search }),
      ).resolves.toBeNull();
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "query key",
      `?${"k".repeat(PUBLIC_PAGE_QUERY_KEY_MAX_CODE_POINTS)}=v`,
      `?${"k".repeat(PUBLIC_PAGE_QUERY_KEY_MAX_CODE_POINTS + 1)}=v`,
    ],
    [
      "query value",
      `?k=${"v".repeat(PUBLIC_PAGE_QUERY_VALUE_MAX_CODE_POINTS)}`,
      `?k=${"v".repeat(PUBLIC_PAGE_QUERY_VALUE_MAX_CODE_POINTS + 1)}`,
    ],
  ])(
    "accepts the exact %s boundary and rejects one-over",
    async (_name, exact, over) => {
      const fetcher = vi.fn<typeof fetch>(async () => html("<main>ok</main>"));
      const current = resolver(fetcher);

      await expect(
        current.load({ pathname: "/product", search: exact }),
      ).resolves.not.toBeNull();
      await expect(
        current.load({ pathname: "/product", search: over }),
      ).resolves.toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("accepts exactly 512 KiB and rejects one byte more", async () => {
    const wrapperBytes = Buffer.byteLength("<main></main>");
    const exact = `<main>${"a".repeat(PUBLIC_PAGE_BODY_MAX_BYTES - wrapperBytes)}</main>`;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(html(exact))
      .mockResolvedValueOnce(html(`${exact}b`));
    const current = resolver(fetcher);

    await expect(
      current.load({ pathname: "/product", search: "" }),
    ).resolves.not.toBeNull();
    await expect(
      current.load({ pathname: "/product", search: "" }),
    ).resolves.toBeNull();
  });

  it("extracts main semantics and enforces the title boundary", async () => {
    const page = (title: string) =>
      html(`
        <title>  ${title}  </title>
        <body><p>body fallback must not leak</p><main>
          <h1>公开 产品</h1>
          <p>可见\n正文</p>
          <form>表单秘密<input value="credential"></form>
          <p hidden>hidden secret</p>
          <div aria-hidden="true">aria secret</div>
          <div style="display:none">style secret</div>
          <script>script secret</script><style>.secret{}</style><template>template secret</template><noscript>noscript secret</noscript>
          <aside class="assistant-conversation">assistant secret</aside>
        </main></body>`);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page("题".repeat(PUBLIC_PAGE_TITLE_MAX_CODE_POINTS)),
      )
      .mockResolvedValueOnce(
        page("题".repeat(PUBLIC_PAGE_TITLE_MAX_CODE_POINTS + 1)),
      );
    const current = resolver(fetcher);

    const exact = await current.load({
      pathname: "/product",
      search: "",
    });
    const over = await current.load({ pathname: "/product", search: "" });

    expect(exact?.title).toBe("题".repeat(PUBLIC_PAGE_TITLE_MAX_CODE_POINTS));
    expect(over?.title).toBe("题".repeat(PUBLIC_PAGE_TITLE_MAX_CODE_POINTS));
    expect(exact?.text).toBe("公开 产品 可见 正文");
    expect(exact?.text).not.toMatch(/secret|credential|fallback/u);
  });

  it("excludes content hidden by stylesheet display and visibility rules", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      html(`
        <style>
          .display-secret { display: none }
          .visibility-secret { visibility: hidden }
          .collapse-secret { visibility: collapse }
        </style>
        <main>
          <p>visible content</p>
          <p class="display-secret">display secret</p>
          <section class="visibility-secret"><a href="/solutions/hidden">visibility secret</a></section>
          <p class="collapse-secret">collapse secret</p>
          <form>form secret</form>
          <aside class="assistant-conversation">assistant secret</aside>
        </main>`),
    );

    await expect(
      resolver(fetcher).load({ pathname: "/product", search: "" }),
    ).resolves.toMatchObject({ text: "visible content", links: [] });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("omits encoded path-confusion links without validating them", async () => {
    const unsafe = ["%2f", "%5c", "%00", "%2e%2e", "%zz"];
    const fetcher = vi.fn<typeof fetch>(async () =>
      html(
        `<main><a href="/solutions/safe">safe</a>${unsafe
          .map(
            (segment) =>
              `<a href="/solutions/${segment}">unsafe ${segment}</a>`,
          )
          .join("")}</main>`,
      ),
    );

    await expect(
      resolver(fetcher).load({ pathname: "/product", search: "" }),
    ).resolves.toMatchObject({
      links: [{ href: "/solutions/safe", label: "safe" }],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toBe(
      "https://portal.example.com/solutions/safe",
    );
  });

  it("truncates visible text at the exact Unicode boundary", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        html(`<main>${"😀".repeat(PUBLIC_PAGE_TEXT_MAX_CODE_POINTS)}</main>`),
      )
      .mockResolvedValueOnce(
        html(
          `<main>${"😀".repeat(PUBLIC_PAGE_TEXT_MAX_CODE_POINTS + 1)}</main>`,
        ),
      );
    const current = resolver(fetcher);

    const exact = await current.load({ pathname: "/product", search: "" });
    const over = await current.load({ pathname: "/product", search: "" });

    expect(Array.from(exact?.text ?? "")).toHaveLength(
      PUBLIC_PAGE_TEXT_MAX_CODE_POINTS,
    );
    expect(Array.from(over?.text ?? "")).toHaveLength(
      PUBLIC_PAGE_TEXT_MAX_CODE_POINTS,
    );
  });

  it("validates no more than 64 unique same-origin public links and returns only live HTML", async () => {
    const links = [
      ...Array.from(
        { length: PUBLIC_PAGE_LINKS_MAX + 1 },
        (_, index) => `<a href="/solutions/slug-${index}">方案 ${index}</a>`,
      ),
      '<a href="https://evil.example/private">external</a>',
      '<a href="/admin/assistant">admin</a>',
      '<a href="/assistant">assistant</a>',
      '<a href="/solutions/slug-0#repeat">repeat</a>',
    ].join("");
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/product") return html(`<main>${links}</main>`);
      if (url.pathname.endsWith("slug-1"))
        return new Response("missing", { status: 404 });
      return html("<main>destination</main>");
    });

    const context = await resolver(fetcher).load({
      pathname: "/product",
      search: "",
    });

    expect(fetcher).toHaveBeenCalledTimes(1 + PUBLIC_PAGE_LINKS_MAX);
    expect(context?.links).toHaveLength(PUBLIC_PAGE_LINKS_MAX - 1);
    expect(context?.links).not.toContainEqual(
      expect.objectContaining({ href: "/solutions/slug-1" }),
    );
    expect(context?.links).not.toContainEqual(
      expect.objectContaining({ href: "/solutions/slug-64" }),
    );
  });

  it("caps destination validation concurrency at four", async () => {
    let active = 0;
    let maximum = 0;
    const releases: Array<() => void> = [];
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/product") {
        return html(
          `<main>${Array.from({ length: 8 }, (_, index) => `<a href="/solutions/${index}">${index}</a>`).join("")}</main>`,
        );
      }
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return html("<main>ok</main>");
    });

    const loading = resolver(fetcher).load({
      pathname: "/product",
      search: "",
    });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5));
    expect(maximum).toBe(PUBLIC_PAGE_DESTINATION_CONCURRENCY);
    while (releases.length > 0) {
      releases.splice(0).forEach((release) => release());
      await Promise.resolve();
    }
    await loading;
    expect(maximum).toBe(4);
  });

  it("cancels bodies after header-only existence and candidate checks", async () => {
    const cancel = vi.fn(async () => undefined);
    const headerOnly = () => {
      const body = new ReadableStream<Uint8Array>({ cancel });
      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(headerOnly())
      .mockResolvedValueOnce(
        html('<main><a href="/solutions/one">one</a></main>'),
      )
      .mockResolvedValueOnce(headerOnly());
    const current = resolver(fetcher);

    await expect(current.exists("/product")).resolves.toBe(true);
    await expect(
      current.load({ pathname: "/product", search: "" }),
    ).resolves.toMatchObject({
      links: [{ href: "/solutions/one", label: "one" }],
    });
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it("aborts the requested page at exactly 1500ms and stays settled one-over", async () => {
    vi.useFakeTimers();
    try {
      let requestSignal: AbortSignal | undefined;
      const fetcher = vi.fn<typeof fetch>((_input, init) => {
        requestSignal = init?.signal ?? undefined;
        return new Promise(() => undefined);
      });
      const current = resolver(fetcher);
      const loading = current.load({ pathname: "/product", search: "" });

      await vi.advanceTimersByTimeAsync(PUBLIC_PAGE_REQUEST_TIMEOUT_MS - 1);
      expect(requestSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(requestSignal?.aborted).toBe(true);
      await expect(loading).resolves.toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect(requestSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a stalled requested-page body at the same 1500ms deadline", async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn(async () => undefined);
      let requestSignal: AbortSignal | undefined;
      const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
        requestSignal = init?.signal ?? undefined;
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("<main>partial"));
            },
            cancel,
          }),
          { status: 200, headers: { "content-type": "text/html" } },
        );
      });
      let settled = false;
      const loading = resolver(fetcher)
        .load({ pathname: "/product", search: "" })
        .finally(() => {
          settled = true;
        });
      await vi.advanceTimersByTimeAsync(0);

      await vi.advanceTimersByTimeAsync(PUBLIC_PAGE_REQUEST_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      expect(requestSignal?.aborted).toBe(false);
      expect(cancel).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(requestSignal?.aborted).toBe(true);
      await expect(loading).resolves.toBeNull();
      expect(settled).toBe(true);
      expect(cancel).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(1);
      expect(cancel).toHaveBeenCalledOnce();
      await expect(loading).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a stalled requested-page body when the caller aborts", async () => {
    const cancel = vi.fn(async () => undefined);
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(new ReadableStream<Uint8Array>({ cancel }), {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );
    const controller = new AbortController();
    const loading = resolver(fetcher).load(
      { pathname: "/product", search: "" },
      controller.signal,
    );
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());

    controller.abort();

    await expect(loading).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("shares one exact 2000ms destination deadline and omits one-over late links", async () => {
    vi.useFakeTimers();
    try {
      const pending = new Map<
        string,
        { resolve(response: Response): void; signal?: AbortSignal }
      >();
      const fetcher = vi.fn<typeof fetch>((input, init) => {
        const url = new URL(String(input));
        if (url.pathname === "/product") {
          return Promise.resolve(
            html(
              `<main>${Array.from(
                { length: PUBLIC_PAGE_DESTINATION_CONCURRENCY + 1 },
                (_, index) =>
                  `<a href="/solutions/deadline-${index}">${index}</a>`,
              ).join("")}</main>`,
            ),
          );
        }
        return new Promise<Response>((resolve) => {
          pending.set(url.pathname, {
            resolve,
            signal: init?.signal ?? undefined,
          });
        });
      });
      const loading = resolver(fetcher).load({
        pathname: "/product",
        search: "",
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(pending).toHaveLength(PUBLIC_PAGE_DESTINATION_CONCURRENCY);

      await vi.advanceTimersByTimeAsync(1_000);
      pending
        .get("/solutions/deadline-0")
        ?.resolve(html("<main>on time</main>"));
      await vi.advanceTimersByTimeAsync(0);
      expect(pending.has("/solutions/deadline-4")).toBe(true);

      await vi.advanceTimersByTimeAsync(
        PUBLIC_PAGE_DESTINATION_DEADLINE_MS - 1_001,
      );
      expect(pending.get("/solutions/deadline-4")?.signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(pending.get("/solutions/deadline-4")?.signal?.aborted).toBe(true);
      await expect(loading).resolves.toMatchObject({
        links: [{ href: "/solutions/deadline-0", label: "0" }],
      });

      pending
        .get("/solutions/deadline-4")
        ?.resolve(html("<main>too late</main>"));
      await vi.advanceTimersByTimeAsync(1);
      await expect(loading).resolves.toMatchObject({
        links: [{ href: "/solutions/deadline-0", label: "0" }],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns false on fetch failure and null on caller abort", async () => {
    const never = vi.fn<typeof fetch>(() => new Promise(() => undefined));
    const failed = resolver(
      vi.fn<typeof fetch>(async () => {
        throw new Error("network");
      }),
    );
    await expect(failed.exists("/product")).resolves.toBe(false);

    const controller = new AbortController();
    controller.abort();
    await expect(
      resolver(never).load(
        { pathname: "/product", search: "" },
        controller.signal,
      ),
    ).resolves.toBeNull();
  });
});
