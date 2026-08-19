type Slot = "windows" | "macos";

type Artifact = {
  originalFilename: string;
  byteSize: number;
  sha256: string;
};

const slots: Record<Slot, { label: string; accept: string }> = {
  windows: { label: "Windows", accept: ".exe,.msi,.zip" },
  macos: { label: "macOS", accept: ".dmg,.pkg,.zip" },
};

export function DownloadSoftwareArtifacts({
  artifacts,
  disabled,
  onRemove,
  onUpload,
}: {
  artifacts: Record<Slot, Artifact | null>;
  disabled: boolean;
  onRemove(slot: Slot): void;
  onUpload(slot: Slot, file: File): void;
}) {
  return (
    <div className="download-resource-manager__artifact">
      {(Object.keys(slots) as Slot[]).map((slot) => {
        const artifact = artifacts[slot];
        const { accept, label } = slots[slot];
        return (
          <div key={slot}>
            <strong>{label} 安装包</strong>
            {artifact ? (
              <>
                <span>{artifact.originalFilename}</span>
                <span>{artifact.byteSize} bytes</span>
                <span>{artifact.sha256}</span>
                <button
                  className="download-resource-manager__button download-resource-manager__button--danger"
                  disabled={disabled}
                  onClick={() => onRemove(slot)}
                  type="button"
                >
                  移除 {label} 安装包
                </button>
              </>
            ) : (
              <span>暂无资源</span>
            )}
            <label className="download-resource-manager__upload">
              {artifact ? `替换 ${label} 安装包` : `上传 ${label} 安装包`}
              <input
                accept={accept}
                aria-label={`上传 ${label} 安装包`}
                disabled={disabled}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onUpload(slot, file);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}
