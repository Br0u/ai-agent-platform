import { useMDXComponents as getThemeComponents } from "nextra-theme-blog";
import type { MDXComponents } from "nextra/mdx-components";

export function useMDXComponents(
  components: MDXComponents = {},
): MDXComponents {
  return {
    ...getThemeComponents(),
    ...components,
  };
}
