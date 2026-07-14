import Image from "next/image";
import { forwardRef } from "react";

type AssistantLauncherProps = {
  isOpen?: boolean;
  onOpen: () => void;
};

export const AssistantLauncher = forwardRef<
  HTMLButtonElement,
  AssistantLauncherProps
>(function AssistantLauncher({ isOpen = false, onOpen }, ref) {
  return (
    <button
      aria-label="打开 M 助手"
      aria-pressed={isOpen}
      className="assistant-launcher"
      onClick={onOpen}
      ref={ref}
      type="button"
    >
      <Image
        alt=""
        height={52}
        src="/assets/assistant/m-assistant.webp"
        width={52}
      />
    </button>
  );
});
