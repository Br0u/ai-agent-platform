"use client";

import { useActionState, type ReactNode } from "react";
import type { AdminActionState } from "@/server/admin/actions";

const initialState: AdminActionState = { kind: "idle" };

export function AdminMutationForm({
  action,
  children,
  className,
}: {
  action: (
    previous: AdminActionState,
    formData: FormData,
  ) => Promise<AdminActionState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className={className}>
      {children}
      <p aria-live="polite" role="status">
        {state.kind === "success"
          ? "操作已完成。"
          : state.kind === "domain_error"
            ? "操作未完成，请刷新页面后重试。"
            : ""}
      </p>
    </form>
  );
}
