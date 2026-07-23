"use client";

import { useMemo, useRef, useState } from "react";

import {
  parseAdminSkillRuntimeSnapshot,
  type AdminSkillRuntimeSnapshot,
} from "@/features/assistant/admin-skill-runtime-contract";

type Props = { initialSnapshot: AdminSkillRuntimeSnapshot };
type PendingMutation = { key: string; path: string; body: object };

function shortId(value: string | null): string {
  return value === null ? "未配置" : value.slice(0, 8);
}

function responseSnapshot(value: unknown): AdminSkillRuntimeSnapshot | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const snapshot = { ...(value as Record<string, unknown>) };
  delete snapshot.requestId;
  return parseAdminSkillRuntimeSnapshot(snapshot);
}

function isConsistent(snapshot: AdminSkillRuntimeSnapshot): boolean {
  return (
    snapshot.agent.skillCapability !== "degraded" &&
    (snapshot.registry.active?.id ?? null) === snapshot.agent.loadedSetId &&
    snapshot.registry.activationVersion === snapshot.agent.activationVersion
  );
}

function operationError(value: unknown): string | null {
  return typeof value === "object" && value !== null
    ? typeof (value as { error?: { code?: unknown } }).error?.code === "string"
      ? ((value as { error: { code: string } }).error.code ?? null)
      : null
    : null;
}

export function AssistantSkillConfigurationPanel({ initialSnapshot }: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [pending, setPending] = useState(false);
  const [unknownResult, setUnknownResult] = useState(false);
  const [message, setMessage] = useState("等待配置操作。");
  const retry = useRef<PendingMutation | null>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const refresh = async (): Promise<AdminSkillRuntimeSnapshot | null> => {
    try {
      const response = await fetch("/api/v1/admin/assistant/skill-runtime", {
        cache: "no-store",
      });
      const parsed = response.ok
        ? responseSnapshot(await response.json())
        : null;
      if (parsed !== null) setSnapshot(parsed);
      return parsed;
    } catch {
      return null;
    }
  };

  const reconcileUnknown = async (): Promise<void> => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      const current = await refresh();
      if (
        current !== null &&
        current.agent.skillCapability !== "preparing" &&
        current.agent.failureCode !== "activation_result_unknown"
      ) {
        retry.current = null;
        setUnknownResult(false);
        setMessage(
          isConsistent(current)
            ? "对账完成，运行状态已确认。"
            : "对账完成，但 Registry 与 Agent 状态不一致。",
        );
        return;
      }
    }
    setMessage("激活结果仍在对账，请稍后刷新；不要重复创建候选。");
  };

  const mutate = async (
    key: string,
    path: string,
    createBody: () => object,
    success: string,
  ) => {
    if (pending || !snapshot.permissions.canConfigure) return;
    const operation =
      retry.current?.key === key
        ? retry.current
        : { key, path, body: createBody() };
    retry.current = operation;
    setPending(true);
    setMessage("正在提交…");
    try {
      const response = await fetch(operation.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(operation.body),
      });
      const value: unknown = await response.json();
      if (!response.ok) {
        const code = operationError(value);
        if (
          code === "activation_result_unknown" ||
          code === "activation_timeout"
        ) {
          setUnknownResult(true);
          setMessage("激活结果未知，正在读取权威状态…");
          await reconcileUnknown();
          return;
        }
        setMessage(
          code === "reauth_required"
            ? "需要重新验证密码和双因素认证。"
            : `操作失败：${code ?? "runtime_degraded"}；重试将复用同一请求。`,
        );
        return;
      }
      retry.current = null;
      setUnknownResult(false);
      setSelected([]);
      setConfirmEmpty(false);
      setMessage(
        (await refresh()) === null ? `${success}，刷新状态失败。` : success,
      );
    } catch {
      setMessage("网络结果未知；重试将复用同一请求。");
    } finally {
      setPending(false);
    }
  };

  const consistent = isConsistent(snapshot);
  const runtimeWritable =
    consistent &&
    snapshot.agent.skillCapability !== "preparing" &&
    snapshot.agent.skillCapability !== "degraded";
  const quotaAvailable = snapshot.registry.candidateCount < 20;
  const canMutate =
    snapshot.permissions.canConfigure &&
    runtimeWritable &&
    quotaAvailable &&
    !unknownResult;

  const createCandidate = () => {
    if (selected.length === 0 && !confirmEmpty) {
      setConfirmEmpty(true);
      setMessage("空集合会关闭码多多的全部 Skill；请再次确认。 ");
      return;
    }
    void mutate(
      "create",
      "/api/v1/admin/assistant/skill-runtime/candidates",
      () => ({
        agentId: "maduoduo",
        revisionIds: selected,
        requestId: crypto.randomUUID(),
      }),
      "候选集合已创建。",
    );
  };

  return (
    <section
      aria-labelledby="assistant-skill-runtime-title"
      className="assistant-admin__skill-runtime"
    >
      <header>
        <div>
          <p>REVIEWED SKILL RUNTIME</p>
          <h2 id="assistant-skill-runtime-title">码多多 Skill 配置</h2>
        </div>
        <strong data-state={consistent ? "ready" : "degraded"}>
          {consistent ? "REGISTRY / AGENT 一致" : "运行状态不一致"}
        </strong>
      </header>

      <dl aria-label="Skill 运行时真相">
        <div>
          <dt>Registry Active</dt>
          <dd>{shortId(snapshot.registry.active?.id ?? null)}</dd>
        </div>
        <div>
          <dt>Agent Loaded</dt>
          <dd>{shortId(snapshot.agent.loadedSetId)}</dd>
        </div>
        <div>
          <dt>Previous</dt>
          <dd>{shortId(snapshot.registry.previous?.id ?? null)}</dd>
        </div>
        <div>
          <dt>Activation Version</dt>
          <dd>{snapshot.registry.activationVersion}</dd>
        </div>
        <div>
          <dt>Capability</dt>
          <dd>{snapshot.agent.skillCapability}</dd>
        </div>
        <div>
          <dt>Failure Code</dt>
          <dd>{snapshot.agent.failureCode ?? "无"}</dd>
        </div>
      </dl>

      <div className="assistant-admin__skill-runtime-grid">
        <section aria-label="可用已发布 Skill">
          <h3>选择已发布版本</h3>
          {snapshot.available.items.length === 0 ? (
            <p>暂无可配置版本，可创建显式空集合。</p>
          ) : (
            <ul>
              {snapshot.available.items.map((item) => (
                <li key={item.revisionId}>
                  {snapshot.permissions.canConfigure ? (
                    <label>
                      <input
                        checked={selectedSet.has(item.revisionId)}
                        disabled={
                          pending ||
                          unknownResult ||
                          !runtimeWritable ||
                          (!selectedSet.has(item.revisionId) &&
                            selected.length >= 16)
                        }
                        onChange={() => {
                          setConfirmEmpty(false);
                          retry.current = null;
                          setSelected((current) =>
                            current.includes(item.revisionId)
                              ? current.filter((id) => id !== item.revisionId)
                              : [
                                  ...current.filter((id) =>
                                    snapshot.available.items.every(
                                      (candidate) =>
                                        candidate.revisionId !== id ||
                                        candidate.skillId !== item.skillId,
                                    ),
                                  ),
                                  item.revisionId,
                                ],
                          );
                        }}
                        type="checkbox"
                      />
                      <span>{item.slug}</span>
                      <small>revision #{item.revisionNo}</small>
                    </label>
                  ) : (
                    <span>
                      {item.slug} · revision #{item.revisionNo}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {snapshot.permissions.canConfigure ? (
            <button
              disabled={pending || !canMutate}
              onClick={createCandidate}
              type="button"
            >
              {confirmEmpty && selected.length === 0
                ? "确认创建空集合"
                : "创建候选集合"}
            </button>
          ) : null}
        </section>

        <section aria-label="Skill 候选集合">
          <h3>候选集合 ({snapshot.registry.candidateCount}/20)</h3>
          {snapshot.registry.candidates.length === 0 ? (
            <p>当前没有待激活候选。</p>
          ) : (
            <ul>
              {snapshot.registry.candidates.map((candidate) => (
                <li key={candidate.id}>
                  <span>
                    {shortId(candidate.id)} · {candidate.itemCount} Skills
                  </span>
                  {snapshot.permissions.canConfigure ? (
                    <div>
                      <button
                        disabled={pending || unknownResult || !runtimeWritable}
                        onClick={() =>
                          void mutate(
                            `activate:${candidate.id}`,
                            `/api/v1/admin/assistant/skill-runtime/candidates/${candidate.id}/activate`,
                            () => ({
                              expectedActivationVersion:
                                snapshot.registry.activationVersion,
                              requestId: crypto.randomUUID(),
                            }),
                            "候选集合已激活。",
                          )
                        }
                        type="button"
                      >
                        激活
                      </button>
                      <button
                        disabled={pending || unknownResult || !runtimeWritable}
                        onClick={() =>
                          void mutate(
                            `discard:${candidate.id}`,
                            `/api/v1/admin/assistant/skill-runtime/candidates/${candidate.id}/discard`,
                            () => ({ requestId: crypto.randomUUID() }),
                            "候选集合已丢弃。",
                          )
                        }
                        type="button"
                      >
                        丢弃
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {snapshot.permissions.canConfigure ? (
            <button
              disabled={
                pending ||
                unknownResult ||
                !runtimeWritable ||
                snapshot.registry.previous === null
              }
              onClick={() => {
                const previous = snapshot.registry.previous;
                if (previous === null) return;
                void mutate(
                  "rollback",
                  "/api/v1/admin/assistant/skill-runtime/rollback",
                  () => ({
                    expectedActivationVersion:
                      snapshot.registry.activationVersion,
                    expectedPreviousSetId: previous.id,
                    requestId: crypto.randomUUID(),
                    activationRequestId: crypto.randomUUID(),
                  }),
                  "已创建并激活回滚集合。",
                );
              }}
              type="button"
            >
              回滚到上一集合
            </button>
          ) : null}
        </section>
      </div>
      <footer>
        <p aria-live="polite" role="status">
          {message}
        </p>
        <button
          disabled={pending || !snapshot.permissions.canRead}
          onClick={() => {
            if (!unknownResult) {
              void refresh();
              return;
            }
            setPending(true);
            void reconcileUnknown().finally(() => setPending(false));
          }}
          type="button"
        >
          刷新运行状态
        </button>
      </footer>
    </section>
  );
}
