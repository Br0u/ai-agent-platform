import type { ReactNode } from "react";
import { ViewTransitions } from "next-view-transitions";
import "nextra-theme-blog/style.css";
import "./docs-nextra.css";

export default async function DocsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="docs-nextra-shell">
      <article
        className="x:container x:px-4 x:prose x:max-md:prose-sm x:dark:prose-invert"
        dir="ltr"
        data-pagefind-body
      >
        <ViewTransitions>{children}</ViewTransitions>
      </article>
    </div>
  );
}
