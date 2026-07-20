"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";

export type PublicDocsSearchItem = {
  slug: string;
  title: string;
  summary: string;
  navigation: {
    label: string;
  };
};

const SEARCH_RESULT_LIMIT = 8;

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function DocsSearch({
  documents,
}: {
  documents: readonly PublicDocsSearchItem[];
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const normalizedQuery = normalized(query);
  const matches = useMemo(() => {
    if (!normalizedQuery) return [];
    return documents.filter((document) =>
      normalized(
        [document.title, document.summary, document.navigation.label].join(" "),
      ).includes(normalizedQuery),
    );
  }, [documents, normalizedQuery]);
  const results = matches.slice(0, SEARCH_RESULT_LIMIT);

  return (
    <div className="public-docs-search" role="search">
      <label className="public-docs-search__label" htmlFor={inputId}>
        搜索文档
      </label>
      <input
        id={inputId}
        className="public-docs-search__input"
        type="search"
        autoComplete="off"
        maxLength={120}
        placeholder="搜索已发布文档…"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />

      {normalizedQuery ? (
        <div className="public-docs-search__results">
          <p
            className="public-docs-search__status"
            role="status"
            aria-live="polite"
          >
            {matches.length > 0
              ? `找到 ${matches.length} 篇文档`
              : "没有匹配的文档"}
          </p>
          {results.length > 0 ? (
            <ul aria-label="搜索结果">
              {results.map((document) => (
                <li key={document.slug}>
                  <Link href={`/docs/${document.slug}`}>
                    <strong>{document.title}</strong>
                    <small>{document.summary}</small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
