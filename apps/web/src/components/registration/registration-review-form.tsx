"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ReviewActionState } from "@/server/registration/actions";
import {
  approveRegistration,
  rejectRegistration,
} from "@/server/registration/server-actions";

type Action = (
  state: ReviewActionState,
  data: FormData,
) => Promise<ReviewActionState>;
const initial: ReviewActionState = {
  kind: "validation_error",
  fieldErrors: {},
};

function Result({ state }: { state: ReviewActionState }) {
  const message =
    state.kind === "success"
      ? "审核已完成。"
      : state.kind === "validation_error" &&
          Object.keys(state.fieldErrors).length > 0
        ? "请检查表单中的必填项和格式。"
        : state.kind === "domain_error" &&
            state.code === "REGISTRATION_ALREADY_REVIEWED"
          ? "该申请已被其他审核人处理，请刷新列表。"
          : state.kind === "domain_error"
            ? "审核未完成，请刷新后重试。"
            : "";
  return (
    <p aria-live="polite" className="review-form__result" role="status">
      {message}
    </p>
  );
}

function ApproveButton({ confirmed }: { confirmed: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="review-form__approve"
      disabled={!confirmed || pending}
      type="submit"
    >
      {pending ? "正在批准…" : "批准注册"}
    </button>
  );
}

function RejectButton() {
  const { pending } = useFormStatus();
  return (
    <button className="review-form__reject" disabled={pending} type="submit">
      {pending ? "正在拒绝…" : "拒绝注册"}
    </button>
  );
}

export function RegistrationReviewForm({
  request,
  approveAction = approveRegistration,
  rejectAction = rejectRegistration,
  initialApproveState = initial,
  initialRejectState = initial,
}: {
  request: { id: string; companyName: string };
  approveAction?: Action;
  rejectAction?: Action;
  initialApproveState?: ReviewActionState;
  initialRejectState?: ReviewActionState;
}) {
  const [organizationKind, setOrganizationKind] = useState<"create" | "link">(
    "create",
  );
  const [confirmed, setConfirmed] = useState(false);
  const [approveState, approveFormAction] = useActionState(
    approveAction,
    initialApproveState,
  );
  const [rejectState, rejectFormAction] = useActionState(
    rejectAction,
    initialRejectState,
  );
  return (
    <div className="review-form">
      <form action={approveFormAction} className="review-form__section">
        <input name="requestId" type="hidden" value={request.id} />
        <fieldset>
          <legend>组织处理</legend>
          <label>
            <input
              checked={organizationKind === "create"}
              name="organizationKind"
              onChange={() => setOrganizationKind("create")}
              type="radio"
              value="create"
            />{" "}
            新建组织（推荐）
          </label>
          <label>
            <input
              checked={organizationKind === "link"}
              name="organizationKind"
              onChange={() => setOrganizationKind("link")}
              type="radio"
              value="link"
            />{" "}
            关联现有组织
          </label>
        </fieldset>
        {organizationKind === "create" ? (
          <label>
            组织法定名称
            <input
              defaultValue={request.companyName}
              maxLength={240}
              name="legalName"
              required
            />
          </label>
        ) : (
          <label>
            现有组织 ID
            <input
              aria-describedby="organization-id-help"
              name="organizationId"
              required
              type="text"
            />
            <small id="organization-id-help">
              请输入已确认的组织 UUID；当前页面不提供组织检索。
            </small>
          </label>
        )}
        <label>
          后续成员角色
          <select defaultValue="customer_member" name="initialRole">
            <option value="customer_member">普通成员</option>
            <option value="customer_admin">管理员</option>
          </select>
          <small>组织的首位成员将由系统强制设为管理员。</small>
        </label>
        <label>
          审核备注（可选）
          <textarea maxLength={2000} name="reviewNote" />
        </label>
        <label className="review-form__confirm">
          <input
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            type="checkbox"
          />{" "}
          确认激活客户账号并写入组织关系
        </label>
        <ApproveButton confirmed={confirmed} />
        <Result state={approveState} />
      </form>
      <form
        action={rejectFormAction}
        className="review-form__section review-form__section--reject"
      >
        <input name="requestId" type="hidden" value={request.id} />
        <label>
          拒绝说明
          <textarea maxLength={2000} name="reviewNote" required />
        </label>
        <RejectButton />
        <Result state={rejectState} />
      </form>
    </div>
  );
}
