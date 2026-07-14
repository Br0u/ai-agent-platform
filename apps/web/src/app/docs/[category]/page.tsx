import { importPage } from "nextra/pages";
import type { Metadata } from "next";
import { useMDXComponents as getMDXComponents } from "@/mdx-components";

type PageProps = {
  params: Promise<{ category: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { category } = await params;
  const document = await importPage([category]);

  return document.metadata;
}

export default async function DocsDocumentPage({ params }: PageProps) {
  const resolvedParams = await params;
  const { category } = resolvedParams;
  const document = await importPage([category]);

  const { default: MDXContent, metadata, sourceCode, toc } = document;
  const Wrapper = getMDXComponents().wrapper;

  if (!Wrapper) {
    return <MDXContent params={resolvedParams} />;
  }

  return (
    <Wrapper metadata={metadata} sourceCode={sourceCode} toc={toc}>
      <MDXContent params={resolvedParams} />
    </Wrapper>
  );
}
