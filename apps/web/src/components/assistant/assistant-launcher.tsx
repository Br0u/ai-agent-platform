import Image from "next/image";
import { forwardRef } from "react";

type AssistantLauncherProps = {
  onOpen: () => void;
};

export const AssistantLauncher = forwardRef<
  HTMLButtonElement,
  AssistantLauncherProps
>(function AssistantLauncher({ onOpen }, ref) {
  return (
    <button
      aria-label="打开 M 助手"
      className="assistant-launcher"
      onClick={onOpen}
      ref={ref}
      type="button"
    >
      <Image
        alt="M 助手"
        height={52}
        src="/assets/assistant/m-assistant.webp"
        width={52}
      />
    </button>
  );
});
