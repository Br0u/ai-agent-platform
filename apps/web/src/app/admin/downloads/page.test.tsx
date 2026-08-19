import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), list: vi.fn() }));

vi.mock("@/server/auth/access", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/server/downloads/service", () => ({
  downloadResourceService: { listTypedAdminResources: mocks.list },
}));
vi.mock("@/components/admin/download-resource-manager", () => ({
  DownloadResourceManager: ({ resources }: { resources: unknown[] }) => (
    <div>resources: {resources.length}</div>
  ),
}));

import AdminDownloadsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue({
    userId: "staff",
    permissions: ["admin:downloads"],
  });
  mocks.list.mockResolvedValue({ total: 0, items: [] });
});

describe("AdminDownloadsPage", () => {
  it("authorizes before loading the download resource list", async () => {
    render(await AdminDownloadsPage());

    expect(mocks.requirePermission).toHaveBeenCalledWith("admin:downloads");
    expect(mocks.list).toHaveBeenCalledWith({
      search: "",
      page: 1,
      pageSize: 50,
      sort: "updated_desc",
    });
    expect(screen.getByText("resources: 0")).toBeVisible();
  });

  it("does not query resources when permission is denied", async () => {
    const denial = new Error("denied");
    mocks.requirePermission.mockRejectedValue(denial);

    await expect(AdminDownloadsPage()).rejects.toBe(denial);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
