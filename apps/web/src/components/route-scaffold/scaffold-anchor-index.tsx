import type { NavigationAnchor } from "@/config/navigation";
import "./scaffold-anchor-index.css";

type AnchorContent = {
  status: string;
  description: string;
};

const assertNever = (status: never): never => {
  throw new Error(`Unsupported navigation status: ${String(status)}`);
};

const contentForStatus = (
  status: NavigationAnchor["status"],
): AnchorContent => {
  if (status === undefined) {
    return {
      status: "结构已建立",
      description: "栏目结构已建立，正式内容尚待补充。",
    };
  }

  switch (status) {
    case "live":
      return {
        status: "已开放",
        description: "当前栏目已发布，可查看正式内容。",
      };
    case "scaffold":
      return {
        status: "结构已建立",
        description: "栏目结构已建立，正式内容尚待补充。",
      };
    case "placeholder":
      return {
        status: "尚未开放",
        description: "仅保留结构，未提供下载、申请或提交操作。",
      };
    default:
      return assertNever(status);
  }
};

export function ScaffoldAnchorIndex({
  anchors,
}: {
  anchors: NavigationAnchor[];
}) {
  return (
    <div className="scaffold-anchor-index">
      <nav className="scaffold-anchor-index__nav" aria-label="页面目录">
        <h2>页面目录</h2>
        <ol>
          {anchors.map((anchor) => (
            <li key={anchor.id}>
              <a href={`#${anchor.id}`}>{anchor.label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="scaffold-anchor-index__targets">
        {anchors.map((anchor) => {
          const content = contentForStatus(anchor.status);

          return (
            <section
              className="scaffold-anchor-index__target"
              id={anchor.id}
              key={anchor.id}
              tabIndex={-1}
              aria-labelledby={`${anchor.id}-title`}
            >
              <span className="scaffold-anchor-index__status">
                {content.status}
              </span>
              <div>
                <h2 id={`${anchor.id}-title`}>{anchor.label}</h2>
                <p>{content.description}</p>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function ScaffoldEmptyState({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  const titleId = `${id}-title`;

  return (
    <section className="scaffold-anchor-index__empty" aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      <p>{description}</p>
    </section>
  );
}
