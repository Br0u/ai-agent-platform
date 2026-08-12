"use client";

import {
  parseAdminSkillListResponse,
  parseAdminSkillPermissionFlags,
  type AdminSkillListResponse,
  type AdminSkillPermissionFlags,
} from "@/features/assistant/admin-skill-contract";
import { useEffect, useRef, useState } from "react";
import {
  AssistantSkillUploadDialog,
  type AssistantSkillReplacementTarget,
} from "./assistant-skill-upload-dialog";

export type AdminSkillRegistrySnapshot = {
  capability: "available" | "degraded";
  skills: AdminSkillListResponse["skills"];
  page?: AdminSkillListResponse["page"];
};

type Props = {
  canRead: boolean;
  initialPermissions: AdminSkillPermissionFlags;
  initialSnapshot: AdminSkillRegistrySnapshot;
};

type UnresolvedSkillOperation = {
  skillId: string;
  expectedPresence: "present" | "absent";
  expectedEnabled: boolean | null;
  expectedRevision:
    | { kind: "exact"; revisionId: string }
    | { kind: "changed"; revisionId: string }
    | null;
};

async function trustedMutationFailure(
  response: Response,
): Promise<"result_unknown" | null> {
  try {
    const value: unknown = await response.json();
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Reflect.getPrototypeOf(value) !== Object.prototype
    )
      return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 3) return null;
    if (!["version", "requestId", "error"].every((key) => keys.includes(key)))
      return null;
    const envelope = value as Record<string, unknown>;
    const error = envelope.error;
    if (
      envelope.version !== "1" ||
      typeof envelope.requestId !== "string" ||
      envelope.requestId.length === 0 ||
      typeof error !== "object" ||
      error === null ||
      Array.isArray(error) ||
      Reflect.getPrototypeOf(error) !== Object.prototype ||
      Reflect.ownKeys(error).length !== 1
    )
      return null;
    const code = Reflect.get(error, "code");
    return code === "result_unknown" ? code : null;
  } catch {
    return null;
  }
}

function parseListEnvelope(value: unknown): {
  list: AdminSkillListResponse;
  permissions: AdminSkillPermissionFlags;
} | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return null;
    if (Reflect.getPrototypeOf(value) !== Object.prototype) return null;
    const keys = [
      "version",
      "skills",
      "page",
      "requestId",
      "permissions",
    ] as const;
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some(
        (key) => typeof key !== "string" || !keys.includes(key as never),
      )
    )
      return null;
    const record: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) return null;
      record[key] = descriptor.value;
    }
    if (
      typeof record.requestId !== "string" ||
      record.requestId.length < 1 ||
      record.requestId.length > 128
    )
      return null;
    const list = parseAdminSkillListResponse({
      version: record.version,
      skills: record.skills,
      page: record.page,
    });
    const permissions = parseAdminSkillPermissionFlags(record.permissions);
    return list === null || permissions === null ? null : { list, permissions };
  } catch {
    return null;
  }
}

function isAbortError(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    value.name === "AbortError"
  );
}

export function AssistantSkillRegistryPanel({
  canRead,
  initialPermissions,
  initialSnapshot,
}: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [permissions, setPermissions] = useState(initialPermissions);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mutatingSkillId, setMutatingSkillId] = useState<string | null>(null);
  const [unresolvedOperation, setUnresolvedOperation] =
    useState<UnresolvedSkillOperation | null>(null);
  const uploadTrigger = useRef<HTMLButtonElement>(null);
  const restoreUploadFocus = useRef(false);
  const listAbort = useRef<AbortController | null>(null);
  const listGeneration = useRef(0);
  const [announcement, setAnnouncement] = useState(
    initialSnapshot.capability === "degraded"
      ? "Skill Registry 当前不可用。"
      : "",
  );

  useEffect(() => {
    if (!uploadOpen && restoreUploadFocus.current) {
      restoreUploadFocus.current = false;
      uploadTrigger.current?.focus();
    }
  }, [uploadOpen]);

  useEffect(
    () => () => {
      listGeneration.current += 1;
      listAbort.current?.abort();
    },
    [],
  );

  const closeUpload = () => {
    restoreUploadFocus.current = true;
    setUploadOpen(false);
  };

  const openUpload = (trigger: HTMLButtonElement) => {
    uploadTrigger.current = trigger;
    setUploadOpen(true);
  };

  const refresh = async (
    announce = true,
    expectation: UnresolvedSkillOperation | null = null,
  ): Promise<boolean> => {
    const generation = listGeneration.current + 1;
    listGeneration.current = generation;
    listAbort.current?.abort();
    const controller = new AbortController();
    listAbort.current = controller;
    setRefreshing(true);
    setAnnouncement("");
    try {
      for (
        let offset = 0;
        offset <= 1_000_000;
        offset += expectation === null ? 25 : 100
      ) {
        const limit = expectation === null ? 25 : 100;
        const response = await fetch(
          `/api/v1/admin/assistant/skills?limit=${limit}&offset=${offset}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (controller.signal.aborted || generation !== listGeneration.current)
          return false;
        if (!response.ok) throw new Error("list failed");
        const parsed = parseListEnvelope(await response.json());
        if (controller.signal.aborted || generation !== listGeneration.current)
          return false;
        if (parsed === null) throw new Error("invalid list response");
        const found =
          expectation === null
            ? undefined
            : parsed.list.skills.find(
                (skill) => skill.id === expectation.skillId,
              );
        const expectedSkillObserved =
          found !== undefined &&
          expectation !== null &&
          expectation.expectedEnabled !== null &&
          found.enabled === expectation.expectedEnabled &&
          expectation.expectedRevision !== null &&
          (expectation.expectedRevision.kind === "exact"
            ? found.revisionId === expectation.expectedRevision.revisionId
            : found.revisionId !== expectation.expectedRevision.revisionId);
        const expectedResultObserved =
          expectation === null ||
          (expectation.expectedPresence === "present" &&
            expectedSkillObserved) ||
          (expectation.expectedPresence === "absent" &&
            found === undefined &&
            parsed.list.page.returned < limit);
        if (expectedResultObserved) {
          setSnapshot((current) => ({
            capability: "available",
            skills:
              expectation?.expectedPresence === "absent"
                ? current.skills.filter(
                    (skill) => skill.id !== expectation.skillId,
                  )
                : parsed.list.skills,
            page: parsed.list.page,
          }));
          setPermissions(parsed.permissions);
          if (announce) setAnnouncement("Skill 列表已刷新。");
          return true;
        }
        if (found !== undefined) return false;
        if (parsed.list.page.returned < limit) return false;
      }
      return false;
    } catch (caught) {
      if (
        isAbortError(caught) ||
        controller.signal.aborted ||
        generation !== listGeneration.current
      )
        return false;
      setSnapshot((current) => ({ ...current, capability: "degraded" }));
      if (announce)
        setAnnouncement("刷新失败，Registry 处于 degraded；已保留旧数据。");
      return false;
    } finally {
      if (generation === listGeneration.current) {
        listAbort.current = null;
        setRefreshing(false);
      }
    }
  };

  const uploaded = () => {
    closeUpload();
    setAnnouncement("上传完成。");
    void refresh();
  };

  const loadReplacementTarget = async (
    skillId: string,
  ): Promise<AssistantSkillReplacementTarget | null> => {
    const cached = snapshot.skills.find((skill) => skill.id === skillId);
    if (cached !== undefined) return cached;
    for (let offset = 0; offset <= 1_000_000; offset += 100) {
      const response = await fetch(
        `/api/v1/admin/assistant/skills?limit=100&offset=${offset}`,
        { cache: "no-store" },
      );
      if (!response.ok) return null;
      const parsed = parseListEnvelope(await response.json());
      if (parsed === null) return null;
      const target = parsed.list.skills.find((skill) => skill.id === skillId);
      if (target !== undefined) return target;
      if (parsed.list.page.returned < 100) return null;
    }
    return null;
  };

  const replacementResultUnknown = async (
    previous: AssistantSkillReplacementTarget,
  ): Promise<void> => {
    const expectation: UnresolvedSkillOperation = {
      skillId: previous.id,
      expectedPresence: "present",
      expectedEnabled: previous.enabled,
      expectedRevision: { kind: "changed", revisionId: previous.revisionId },
    };
    setUnresolvedOperation((current) => current ?? expectation);
    closeUpload();
    if (await refresh(false, expectation)) {
      setUnresolvedOperation((current) =>
        current === expectation ? null : current,
      );
      setAnnouncement("Skill 状态已确认。");
    } else {
      setAnnouncement("操作结果正在确认，请刷新后再试。");
    }
  };

  const confirmUnresolvedOperation = async (): Promise<void> => {
    if (unresolvedOperation === null) return;
    const expectation = unresolvedOperation;
    if (await refresh(false, expectation)) {
      setUnresolvedOperation((current) =>
        current === expectation ? null : current,
      );
      setAnnouncement("Skill 状态已确认。");
    } else {
      setAnnouncement("操作结果正在确认，请刷新后再试。");
    }
  };

  const mutate = async (
    skill: AdminSkillListResponse["skills"][number],
    operation: "enable" | "disable" | "delete",
  ) => {
    if (unresolvedOperation !== null || mutatingSkillId !== null) return;
    if (
      operation === "delete" &&
      !window.confirm(
        skill.enabled
          ? `删除 ${skill.name} 会先停用并从 Skill 库移除，是否继续？`
          : `确认从 Skill 库删除 ${skill.name}？`,
      )
    ) {
      return;
    }
    setMutatingSkillId(skill.id);
    setAnnouncement("");
    try {
      const response = await fetch(
        `/api/v1/admin/assistant/skills/${skill.id}${
          operation === "delete" ? "" : `/${operation}`
        }`,
        {
          method: operation === "delete" ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: crypto.randomUUID() }),
        },
      );
      if (!response.ok) {
        const failure = await trustedMutationFailure(response);
        if (failure === "result_unknown") {
          const expectation: UnresolvedSkillOperation = {
            skillId: skill.id,
            expectedPresence: operation === "delete" ? "absent" : "present",
            expectedEnabled:
              operation === "delete" ? null : operation === "enable",
            expectedRevision:
              operation === "delete"
                ? null
                : { kind: "exact", revisionId: skill.revisionId },
          };
          setUnresolvedOperation((current) => current ?? expectation);
          if (await refresh(false, expectation)) {
            setUnresolvedOperation((current) =>
              current === expectation ? null : current,
            );
            setAnnouncement("Skill 状态已确认。");
          } else {
            setAnnouncement("操作结果正在确认，请刷新后再试。");
          }
          return;
        }
        throw new Error("mutation failed");
      }
      await refresh();
      setAnnouncement(
        operation === "enable"
          ? "Skill 已启用。"
          : operation === "disable"
            ? "Skill 已停用。"
            : "Skill 已删除。",
      );
    } catch {
      setAnnouncement("操作失败，Skill 状态未确认。");
    } finally {
      setMutatingSkillId(null);
    }
  };

  return (
    <section
      aria-labelledby="assistant-skill-registry-title"
      className="assistant-skill-registry"
    >
      <header className="assistant-skill-registry__heading">
        <div>
          <p>SKILL REGISTRY</p>
          <h2 id="assistant-skill-registry-title">Skill 库</h2>
          <span>上传、扫描与 Agent 运行时启用已接入。</span>
        </div>
        <strong>
          {snapshot.capability === "available"
            ? "Registry 已接入"
            : snapshot.skills.length > 0
              ? "degraded / 旧数据"
              : "degraded / 数据不可确认"}
        </strong>
      </header>
      <div className="assistant-skill-registry__actions">
        {canRead ? (
          <button
            disabled={refreshing}
            onClick={() =>
              void (unresolvedOperation === null
                ? refresh()
                : confirmUnresolvedOperation())
            }
            type="button"
          >
            刷新 Skill 列表
          </button>
        ) : null}
        {canRead && permissions.canUpload ? (
          <button
            disabled={mutatingSkillId !== null || unresolvedOperation !== null}
            onClick={(event) => openUpload(event.currentTarget)}
            type="button"
          >
            上传 Skill ZIP
          </button>
        ) : null}
      </div>
      <p aria-live="polite" role="status">
        {announcement}
      </p>
      {snapshot.skills.length === 0 ? (
        <p>
          {!canRead
            ? "当前账号没有 Skill 库读取权限。"
            : snapshot.capability === "degraded"
              ? "Skill 列表不可用，不能确认库是否为空。"
              : "当前没有 Skill。"}
        </p>
      ) : (
        <ul
          aria-label="Skill Registry 列表"
          className="assistant-skill-registry__list"
        >
          {snapshot.skills.map((skill) => (
            <li key={skill.id}>
              <div>
                <strong>{skill.enabled ? "● 已启用" : "○ 未启用"}</strong>
                <span>{skill.name}</span>
                <small>{skill.description}</small>
                <time dateTime={skill.uploadedAt}>
                  上传时间：{skill.uploadedAt}
                </time>
              </div>
              <div>
                {canRead && permissions.canConfigure ? (
                  <button
                    disabled={
                      unresolvedOperation !== null ||
                      mutatingSkillId === skill.id
                    }
                    onClick={() =>
                      void mutate(skill, skill.enabled ? "disable" : "enable")
                    }
                    type="button"
                  >
                    {skill.enabled ? "停用" : "启用"}
                  </button>
                ) : null}
                {canRead && permissions.canConfigure ? (
                  <button
                    disabled={
                      unresolvedOperation !== null ||
                      mutatingSkillId === skill.id
                    }
                    onClick={() => void mutate(skill, "delete")}
                    type="button"
                  >
                    删除
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {uploadOpen && canRead && permissions.canUpload ? (
        <AssistantSkillUploadDialog
          loadReplacementTarget={loadReplacementTarget}
          onClose={closeUpload}
          onUploaded={uploaded}
          onReplacementResultUnknown={replacementResultUnknown}
        />
      ) : null}
    </section>
  );
}
