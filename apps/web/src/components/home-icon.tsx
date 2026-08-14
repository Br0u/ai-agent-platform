import type { CSSProperties } from "react";
import type { HomeIconName } from "./home-content";

const icons = {
  analytics: { slug: "chart-page", width: 147, height: 170 },
  clock: { slug: "clock", width: 171, height: 169 },
  code: { slug: "code", width: 179, height: 95 },
  cube: { slug: "cube-perspective", width: 176, height: 192 },
  database: { slug: "database-cylinder-data", width: 144, height: 173 },
  finance: { slug: "financial-quarter-chart", width: 167, height: 175 },
  government: { slug: "courthouse", width: 204, height: 188 },
  inspection: { slug: "engineer-clipboard", width: 176, height: 227 },
  knowledge: { slug: "book-open", width: 177, height: 144 },
  "knowledge-search": { slug: "book-search", width: 130, height: 160 },
  location: { slug: "map-pinned", width: 156, height: 154 },
  mail: { slug: "mail", width: 173, height: 119 },
  phone: { slug: "helpline-phone", width: 171, height: 178 },
  platform: { slug: "layers", width: 178, height: 168 },
  presentation: { slug: "presentation", width: 180, height: 161 },
  video: { slug: "cctv", width: 182, height: 140 },
  workflow: { slug: "workflow-automation", width: 162, height: 166 },
} satisfies Record<
  HomeIconName,
  { slug: string; width: number; height: number }
>;

type IconStyle = CSSProperties & { "--home-icon-image": string };

export function HomeIcon({ name }: { name: HomeIconName }) {
  const icon = icons[name];
  const style: IconStyle = {
    "--home-icon-image": `url("/assets/home/icons/${icon.slug}.svg")`,
    aspectRatio: `${icon.width} / ${icon.height}`,
  };

  return (
    <span
      aria-hidden="true"
      className="home-koboyo-icon"
      data-home-icon={name}
      style={style}
    />
  );
}
