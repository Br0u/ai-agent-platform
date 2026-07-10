import "./asset-placeholder.css";

type AssetPlaceholderProps = {
  label: string;
  ratio?: string;
};

export function AssetPlaceholder({
  label,
  ratio = "16 / 10",
}: AssetPlaceholderProps) {
  return (
    <figure
      className="asset-placeholder"
      aria-label={label}
      style={{ aspectRatio: ratio }}
    >
      <span>[ {label} · 待替换 ]</span>
      <figcaption>此处仅保留正式资产的布局位置</figcaption>
    </figure>
  );
}
