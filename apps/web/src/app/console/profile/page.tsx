import { revokeCustomerSessionAction } from "@/server/admin/actions";
import { createDefaultCustomerSessionService } from "@/server/admin/sessions";
import { requireConsolePage } from "@/server/auth/workspace-route-guards";

export default async function Page() {
  const actor = await requireConsolePage();
  const sessions = await createDefaultCustomerSessionService().list(
    actor.userId,
  );
  return (
    <main className="admin-workbench">
      <header>
        <p>Customer Account</p>
        <h1>个人资料与设备</h1>
        <p>{actor.displayName}，你可以查看并退出自己的登录设备。</p>
      </header>
      <section>
        <h2>登录会话</h2>
        {sessions.length ? (
          <ul>
            {sessions.map((session) => (
              <li key={session.id}>
                <strong>{session.userAgent ?? "未知设备"}</strong>
                <br />
                <time dateTime={session.createdAt}>
                  {session.createdAt.slice(0, 19).replace("T", " ")}
                </time>
                <form action={revokeCustomerSessionAction}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <button>退出此设备</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p>没有活动会话</p>
        )}
      </section>
    </main>
  );
}
