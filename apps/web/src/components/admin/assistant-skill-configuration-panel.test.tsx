import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminSkillRuntimeSnapshot } from "@/features/assistant/admin-skill-runtime-contract";
import { AssistantSkillConfigurationPanel } from "./assistant-skill-configuration-panel";

const ACTIVE = "11111111-1111-4111-8111-111111111111";
const PREVIOUS = "22222222-2222-4222-8222-222222222222";
const CANDIDATE = "33333333-3333-4333-8333-333333333333";
const SKILL = "44444444-4444-4444-8444-444444444444";
const REVISION = "55555555-5555-4555-8555-555555555555";

function set(id: string, state: "candidate" | "active" | "superseded") {
  return {
    id,
    state,
    revisionIds: [REVISION],
    itemCount: 1,
    totalExtractedSize: 42,
    failureCode: null,
  };
}

const snapshot = {
  version: "1",
  available: {
    items: [
      {
        skillId: SKILL,
        revisionId: REVISION,
        slug: "safe-skill",
        revisionNo: 2,
        artifactSha256: "a".repeat(64),
        extractedSize: 42,
      },
    ],
    limit: 100,
    offset: 0,
    total: 1,
  },
  registry: {
    active: set(ACTIVE, "active"),
    previous: set(PREVIOUS, "superseded"),
    activationVersion: 1,
    candidateCount: 1,
    candidates: [set(CANDIDATE, "candidate")],
  },
  agent: {
    skillCapability: "ready",
    configured: true,
    activeSetId: ACTIVE,
    loadedSetId: ACTIVE,
    previousSetId: PREVIOUS,
    activationVersion: 1,
    failureCode: null,
  },
  permissions: { canRead: true, canConfigure: true },
} satisfies AdminSkillRuntimeSnapshot;

function envelope(value: AdminSkillRuntimeSnapshot) {
  return { ...value, requestId: "66666666-6666-4666-8666-666666666666" };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AssistantSkillConfigurationPanel", () => {
  it("shows separate Registry and Agent truth plus previous and failure state", () => {
    render(<AssistantSkillConfigurationPanel initialSnapshot={snapshot} />);

    expect(screen.getByText("REGISTRY / AGENT 一致")).toBeVisible();
    expect(screen.getAllByText("11111111")).toHaveLength(2);
    expect(screen.getByText("22222222")).toBeVisible();
    expect(screen.getByText("ready")).toBeVisible();
    expect(screen.getByText("无")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "候选集合 (1/20)" }),
    ).toBeVisible();
  });

  it("hides mutations when the account can only read", () => {
    render(
      <AssistantSkillConfigurationPanel
        initialSnapshot={{
          ...snapshot,
          permissions: { canRead: true, canConfigure: false },
        }}
      />,
    );

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "创建候选集合" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "激活" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "丢弃" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "回滚到上一集合" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新运行状态" })).toBeVisible();
  });

  it("requires explicit empty-set confirmation and reuses its request ID after an unknown network result", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network unknown"))
      .mockResolvedValueOnce(Response.json({}, { status: 201 }))
      .mockResolvedValueOnce(Response.json(envelope(snapshot)));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantSkillConfigurationPanel initialSnapshot={snapshot} />);

    fireEvent.click(screen.getByRole("button", { name: "创建候选集合" }));
    expect(
      screen.getByRole("button", { name: "确认创建空集合" }),
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认创建空集合" }));
    expect(await screen.findByText(/网络结果未知/u)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "确认创建空集合" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const firstBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    const secondBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(firstBody).toEqual(secondBody);
    expect(firstBody).toMatchObject({ agentId: "maduoduo", revisionIds: [] });
    expect(firstBody.requestId).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("polls authority instead of retrying activation when the result is unknown", async () => {
    const activated: AdminSkillRuntimeSnapshot = {
      ...snapshot,
      registry: {
        active: set(CANDIDATE, "active"),
        previous: set(ACTIVE, "superseded"),
        activationVersion: 2,
        candidateCount: 0,
        candidates: [],
      },
      agent: {
        ...snapshot.agent,
        activeSetId: CANDIDATE,
        loadedSetId: CANDIDATE,
        previousSetId: ACTIVE,
        activationVersion: 2,
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: "activation_result_unknown" } },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(Response.json(envelope(activated)));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantSkillConfigurationPanel initialSnapshot={snapshot} />);

    fireEvent.click(screen.getByRole("button", { name: "激活" }));

    expect(await screen.findByText("对账完成，运行状态已确认。")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/v1/admin/assistant/skill-runtime",
    );
  });

  it("disables creation at the 20-candidate quota and mutations while degraded", () => {
    render(
      <AssistantSkillConfigurationPanel
        initialSnapshot={{
          ...snapshot,
          registry: {
            ...snapshot.registry,
            candidateCount: 20,
            candidates: Array.from({ length: 20 }, (_, index) => ({
              ...set(
                `${(index + 10).toString(16).padStart(8, "0")}-3333-4333-8333-333333333333`,
                "candidate",
              ),
            })),
          },
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "创建候选集合" })).toBeDisabled();
  });
});
