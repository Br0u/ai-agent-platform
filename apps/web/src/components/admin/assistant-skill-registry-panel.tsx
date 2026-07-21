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
  const [refreshing, setRefreshing] = useState(false);
  const uploadTrigger = useRef<HTMLButtonElement>(null);
  const restoreUploadFocus = useRef(false);
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

  const closeUpload = () => {
    restoreUploadFocus.current = true;
    setUploadOpen(false);
  };

  const refresh = async () => {
    setRefreshing(true);
    setAnnouncement("");
    try {
      const response = await fetch(
        "/api/v1/admin/assistant/skills?limit=25&offset=0",
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("list failed");
      const parsed = parseListEnvelope(await response.json());
      if (parsed === null) throw new Error("invalid list response");
      setSnapshot({
        capability: "available",
        skills: parsed.list.skills,
        page: parsed.list.page,
      });
      setPermissions(parsed.permissions);
      setSelection((current) =>
        current !== null &&
        parsed.list.skills.some(
          (skill) =>
            skill.id === current.skillId &&
            skill.revision?.id === current.revisionId,
        )
          ? current
          : null,
      );
      setAnnouncement("Skill 列表已刷新。");
    } catch {
      setSnapshot((current) => ({ ...current, capability: "degraded" }));
      setAnnouncement("刷新失败，Registry 处于 degraded；已保留旧数据。");
    } finally {
      setRefreshing(false);
    }
  };

  const uploaded = (revision: AdminSkillRevision) => {
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
    setAnnouncement("上传完成：pending_review，等待独立审核。");
  };

  const revisionChanged = (revision: AdminSkillRevision) => {
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
          <span>上传、扫描和双人审核已接入；Agent 运行时加载尚未接入。</span>
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
            onClick={() => setUploadOpen(true)}
            ref={uploadTrigger}
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
              {canRead && permissions.canReview && skill.revision ? (
                <button
                  aria-expanded={selection?.revisionId === skill.revision.id}
                  onClick={() =>
                    setSelection((current) =>
                      current?.revisionId === skill.revision?.id
                        ? null
                        : { skillId: skill.id, revisionId: skill.revision!.id },
                    )
                  }
                  type="button"
                >
                  查看审核详情 {skill.name}
                </button>
              ) : null}
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
        />
      ) : null}
    </section>
  );
}
