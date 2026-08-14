import type { CSSProperties } from "react";

const icons = {
  利: ["briefcase-money", 223, 210],
  升: ["waves-arrow-up", 156, 169],
  赋: ["benefit-collaboration", 225, 146],
  证: ["badge", 152, 178],
  转: ["bundle-box", 222, 168],
  合: ["benefit-collaboration", 225, 146],
  牌: ["label", 199, 192],
  市: ["bullhorn", 185, 171],
  技: ["compass-ruler", 166, 184],
  训: ["laptop-course", 240, 184],
  机: ["waves-arrow-up", 156, 169],
  品: ["product", 161, 160],
  户: ["report", 129, 174],
  档: ["report", 129, 174],
  料: ["brochure", 225, 174],
  环: ["sandbox-environment", 248, 196],
  专: ["solid-customer-support-headset", 267.1, 267.1],
  学: ["laptop-course", 240, 184],
  考: ["exam-paper", 155, 184],
  群: ["users", 196, 109],
  视: ["edit-lecture", 221, 190],
  实: ["sandbox-environment", 248, 196],
  文: ["report", 129, 174],
  社: ["users", 196, 109],
  播: ["broadcast-lecture", 214, 162],
  司: ["solid-office-building", 279.9, 279.9],
  队: ["team", 205, 111],
  愿: ["benefit-collaboration", 225, 146],
} as const;

export type PartnerIconName = keyof typeof icons;
type IconStyle = CSSProperties & { "--partner-icon-image": string };

export function PartnerIcon({ name }: { name: PartnerIconName }) {
  const [slug, width, height] = icons[name];
  const style: IconStyle = {
    "--partner-icon-image": `url("/assets/partners/icons/${slug}.svg")`,
    aspectRatio: `${width} / ${height}`,
  };

  return (
    <span className="partner-icon" aria-hidden="true">
      <span
        className="partner-koboyo-icon"
        data-partner-icon={name}
        style={style}
      />
    </span>
  );
}
