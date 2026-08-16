import { DownloadResourceManager } from "@/components/admin/download-resource-manager";
import { metadataForRegisteredRoute } from "@/components/route-scaffold/registered-route-page";
import { requirePermission } from "@/server/auth/access";
import { downloadResourceService } from "@/server/downloads/service";
import "@/components/admin/download-resource-manager.css";

export const metadata = metadataForRegisteredRoute("/admin/downloads");

export default async function AdminDownloadsPage() {
  await requirePermission("admin:downloads");
  const resources = await downloadResourceService.listAdminResources({
    search: "",
    page: 1,
    pageSize: 50,
    sort: "updated_desc",
  });
  return <DownloadResourceManager resources={resources.items} />;
}
