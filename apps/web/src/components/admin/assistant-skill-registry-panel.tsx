"use client";

import {
  parseAdminSkillListResponse,
  parseAdminSkillPermissionFlags,
  type AdminSkillListResponse,
  type AdminSkillPermissionFlags,
} from "@/features/assistant/admin-skill-contract";
import { useEffect, useRef, useState } from "react";
import { AssistantSkillUploadDialog } from "./assistant-skill-upload-dialog";

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
  const [pendingSkillId, setPendingSkillId] = useState<string | null>(null);
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

  const refresh = async () => {
    const generation = listGeneration.current + 1;
    listGeneration.current = generation;
    listAbort.current?.abort();
    const controller = new AbortController();
    listAbort.current = controller;
    setRefreshing(true);
    setAnnouncement("");
    try {
      const response = await fetch(
        "/api/v1/admin/assistant/skills?limit=25&offset=0",
        { cache: "no-store", signal: controller.signal },
      );
      if (controller.signal.aborted || generation !== listGeneration.current)
        return;
      if (!response.ok) throw new Error("list failed");
      const parsed = parseListEnvelope(await response.json());
      if (controller.signal.aborted || generation !== listGeneration.current)
        return;
      if (parsed === null) throw new Error("invalid list response");
      setSnapshot({
        capability: "available",
        skills: parsed.list.skills,
        page: parsed.list.page,
      });
      setPermissions(parsed.permissions);
      setAnnouncement("Skill 列表已刷新。");
    } catch (caught) {
      if (
        isAbortError(caught) ||
        controller.signal.aborted ||
        generation !== listGeneration.current
      )
        return;
      setSnapshot((current) => ({ ...current, capability: "degraded" }));
      setAnnouncement("刷新失败，Registry 处于 degraded；已保留旧数据。");
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

  const mutate = async (
    skill: AdminSkillListResponse["skills"][number],
    operation: "enable" | "disable" | "delete",
  ) => {
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
    setPendingSkillId(skill.id);
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
      if (!response.ok) throw new Error("mutation failed");
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
      setPendingSkillId(null);
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
            onClick={() => void refresh()}
            type="button"
          >
            刷新 Skill 列表
          </button>
        ) : null}
        {canRead && permissions.canUpload ? (
          <button
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
              </div>
              <div>
                {canRead && permissions.canConfigure ? (
                  <button
                    disabled={pendingSkillId === skill.id}
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
                    disabled={pendingSkillId === skill.id}
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
          onClose={closeUpload}
          onUploaded={uploaded}
        />
      ) : null}
    </section>
  );
}
