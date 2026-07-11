import "./navigation.css";
import type { NavigationSection } from "./navigation-types";

const metaPlaceholders = [
  "公司信息待补充",
  "隐私政策（占位）",
  "备案信息（占位）",
] as const;

export function SiteFooter({ groups }: { groups: NavigationSection[] }) {
  return (
    <footer className="portal-footer">
      <div className="portal-footer__main">
        <div className="portal-footer__brand">
          <strong>AI Agent Platform</strong>
          <span>Build Enterprise AI Faster</span>
        </div>

        <nav className="portal-footer__navigation" aria-label="页脚导航">
          {groups.map((group) => (
            <section className="portal-footer__group" key={group.label}>
              <h2>{group.label}</h2>
              <ul>
                {group.items.map((item) =>
                  typeof item.href === "string" ? (
                    <li key={item.href}>
                      <a className="portal-footer__link" href={item.href}>
                        {item.label}
                      </a>
                    </li>
                  ) : null,
                )}
              </ul>
            </section>
          ))}
        </nav>
      </div>

      <div className="portal-footer__meta">
        {metaPlaceholders.map((text) => (
          <span key={text}>{text}</span>
        ))}
      </div>
    </footer>
  );
}
