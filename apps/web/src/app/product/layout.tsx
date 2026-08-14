import type { ReactNode } from "react";

import { ProductDirectory } from "@/components/product-directory";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <div className="product-directory-layout">
      <ProductDirectory />
      <div className="product-directory-content">{children}</div>
    </div>
  );
}
