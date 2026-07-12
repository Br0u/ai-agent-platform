import { updateSiteSettingsAction } from "@/server/admin/actions";
import { requirePermission } from "@/server/auth/access";

export default async function Page() {
  await requirePermission("admin:site");
  return (
    <main className="admin-workbench">
      <header>
        <p>Portal Operations</p>
        <h1>站点配置</h1>
        <p>当前仅开放支持提示配置审计入口；内容持久化将在 CMS 模块实施。</p>
      </header>
      <form action={updateSiteSettingsAction}>
        <input type="hidden" name="field" value="supportMessage" />
        <label>
          支持提示
          <textarea name="value" disabled placeholder="等待 CMS 配置存储接入" />
        </label>
        <button disabled>保存配置</button>
      </form>
    </main>
  );
}
