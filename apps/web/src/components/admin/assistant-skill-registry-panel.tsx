"use client";

import {
  parseAdminSkillListResponse,
  parseAdminSkillPermissionFlags,
  type AdminSkillListResponse,
  type AdminSkillPermissionFlags,
  type AdminSkillRevision,
} from "@/features/assistant/admin-skill-contract";
import { useEffect, useRef, useState } from "react";
import { AssistantSkillRevisionDetail } from "./assistant-skill-revision-detail";
import { AssistantSkillUploadDialog } from "./assistant-skill-upload-dialog";

export type AdminSkillRegistrySnapshot = {
  capability: "available" | "degraded";
  skills: AdminSkillListResponse["skills"];
  page?: AdminSkillListResponse["page"];
};

type Props = {
  actorUserId: string;
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
  actorUserId,
  canRead,
  initialPermissions,
  initialSnapshot,
}: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [permissions, setPermissions] = useState(initialPermissions);
  const [selection, setSelection] = useState<{
    skillId: string;
    revisionId: string;
  } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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

  const invalidateListRequest = () => {
    listGeneration.current += 1;
    listAbort.current?.abort();
    listAbort.current = null;
    setRefreshing(false);
  };

  const closeUpload = () => {
    restoreUploadFocus.current = true;
    setUploadOpen(false);
    setUploadTarget(null);
  };

  const openUpload = (
    trigger: HTMLButtonElement,
    target: { id: string; name: string } | null,
  ) => {
    uploadTrigger.current = trigger;
    setUploadTarget(target);
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
      setSelection((current) => {
        if (current === null) return null;
        const previousRevision = snapshot.skills.find(
          (skill) => skill.id === current.skillId,
        )?.revision;
        const nextRevision = parsed.list.skills.find(
          (skill) => skill.id === current.skillId,
        )?.revision;
        return previousRevision !== null &&
          previousRevision !== undefined &&
          nextRevision !== null &&
          nextRevision !== undefined &&
          previousRevision.id === current.revisionId &&
          nextRevision.id === current.revisionId &&
          previousRevision.number === nextRevision.number &&
          previousRevision.state === nextRevision.state &&
          previousRevision.createdBy === nextRevision.createdBy &&
          previousRevision.artifactSha256Prefix ===
            nextRevision.artifactSha256Prefix &&
          previousRevision.reviewedBy === nextRevision.reviewedBy &&
          previousRevision.reviewedAt === nextRevision.reviewedAt
          ? current
          : null;
      });
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

  const uploaded = (revision: AdminSkillRevision) => {
    invalidateListRequest();
    setSnapshot((current) => {
      const existing = current.skills.find(
        (skill) => skill.id === revision.skillId,
      );
      const item: AdminSkillListResponse["skills"][number] = {
        id: revision.skillId,
        name: revision.name,
        createdAt: existing?.createdAt ?? revision.createdAt,
        revision: {
          id: revision.id,
          number: revision.number,
          state: revision.state,
          sourceType: "upload",
          artifactSha256Prefix: revision.artifactSha256.slice(0, 12),
          createdBy: revision.createdBy,
          createdAt: revision.createdAt,
          reviewedBy: revision.reviewedBy,
          reviewedAt: revision.reviewedAt,
        },
      };
      const limit = current.page?.limit ?? 25;
      const skills = [
        item,
        ...current.skills.filter((skill) => skill.id !== revision.skillId),
      ].slice(0, limit);
      return {
        capability: "available",
        skills,
        page: {
          limit: current.page?.limit ?? 25,
          offset: 0,
          returned: skills.length,
        },
      };
    });
    setSelection(null);
    closeUpload();
    setAnnouncement("上传完成：pending_review，等待审核。");
  };

  const revisionChanged = (revision: AdminSkillRevision) => {
    invalidateListRequest();
    setSnapshot((current) => ({
      ...current,
      skills: current.skills.map((skill) =>
        skill.id !== revision.skillId || skill.revision?.id !== revision.id
          ? skill
          : {
              ...skill,
              revision: {
                ...skill.revision,
                state: revision.state,
                reviewedBy: revision.reviewedBy,
                reviewedAt: revision.reviewedAt,
              },
            },
      ),
    }));
  };

  return (
    <section
      aria-labelledby="assistant-skill-registry-title"
      className="assistant-skill-registry"
    >
      <header className="assistant-skill-registry__heading">
        <div>
          <p>REVIEWED SKILL REGISTRY</p>
          <h2 id="assistant-skill-registry-title">Skill 库</h2>
          <span>上传、扫描、审核与 Agent 运行时加载已接入。</span>
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
            onClick={(event) => openUpload(event.currentTarget, null)}
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
                <strong>{skill.name}</strong>
                {skill.revision ? (
                  <span>
                    revision #{skill.revision.number} ·{" "}
                    <strong>{skill.revision.state}</strong> · digest{" "}
                    {skill.revision.artifactSha256Prefix}
                  </span>
                ) : (
                  <span>尚无 revision</span>
                )}
              </div>
              <div>
                {canRead && permissions.canUpload ? (
                  <button
                    onClick={(event) =>
                      openUpload(event.currentTarget, {
                        id: skill.id,
                        name: skill.name,
                      })
                    }
                    type="button"
                  >
                    上传新版本 {skill.name}
                  </button>
                ) : null}
                {canRead && permissions.canReview && skill.revision ? (
                  <button
                    aria-expanded={selection?.revisionId === skill.revision.id}
                    onClick={() =>
                      setSelection((current) =>
                        current?.revisionId === skill.revision?.id
                          ? null
                          : {
                              skillId: skill.id,
                              revisionId: skill.revision!.id,
                            },
                      )
                    }
                    type="button"
                  >
                    查看审核详情 {skill.name}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {selection && canRead && permissions.canReview ? (
        <AssistantSkillRevisionDetail
          actorUserId={actorUserId}
          key={`${selection.skillId}:${selection.revisionId}`}
          onRevisionChanged={revisionChanged}
          revisionId={selection.revisionId}
          skillId={selection.skillId}
        />
      ) : null}
      {uploadOpen && canRead && permissions.canUpload ? (
        <AssistantSkillUploadDialog
          onClose={closeUpload}
          onUploaded={uploaded}
          targetSkill={uploadTarget ?? undefined}
        />
      ) : null}
    </section>
  );
}
