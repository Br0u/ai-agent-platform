"use client";

import { ArrowUp, Check, Mic, Paperclip, Sparkles, X } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import "./assistant-prompt-input.css";

export const ASSISTANT_PROMPT_MAX_ATTACHMENTS = 6;
export const ASSISTANT_PROMPT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type AssistantPromptAttachment = {
  file: File;
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
};

export type AssistantPromptSubmit = {
  attachments: readonly AssistantPromptAttachment[];
  value: string;
};

export type AssistantPromptInputProps = {
  ariaLabel: string;
  disabled?: boolean;
  inputLabel: string;
  onChange: (value: string) => void;
  onSubmit: (input: AssistantPromptSubmit) => void;
  registerComposer: (element: HTMLTextAreaElement) => () => void;
  submitLabel?: string;
  validationMessage?: string;
  value: string;
  variant: "dock" | "quick" | "workspace";
};

function codePointLength(value: string): number {
  return Array.from(value.trim()).length;
}

function createAttachmentId(file: File): string {
  return `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AssistantPromptInput({
  ariaLabel,
  disabled = false,
  inputLabel,
  onChange,
  onSubmit,
  registerComposer,
  submitLabel = "发送",
  validationMessage,
  value,
  variant,
}: AssistantPromptInputProps) {
  const [attachments, setAttachments] = useState<AssistantPromptAttachment[]>(
    [],
  );
  const [futureNotice, setFutureNotice] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] =
    useState<AssistantPromptAttachment | null>(null);
  const [textareaHeight, setTextareaHeight] = useState(58);
  const attachmentsRef = useRef(attachments);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerHelpId = useId();
  const overLimit = codePointLength(value) > 500;
  const hasValue = value.trim().length > 0;
  const expanded = isFocused || hasValue || attachments.length > 0;
  const hasPendingAttachment = attachments.length > 0;
  const feedbackMessage =
    validationMessage ??
    (overLimit ? `${codePointLength(value)} / 500` : null) ??
    (futureNotice || null) ??
    (hasPendingAttachment
      ? "附件已添加，等待多模态模型接入。"
      : `${codePointLength(value)} / 500`);
  const canSubmit =
    !disabled && hasValue && !overLimit && !hasPendingAttachment;
  const canAttemptSubmit = !disabled && !overLimit && !hasPendingAttachment;

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((attachment) => {
        URL.revokeObjectURL(attachment.url);
      });
    };
  }, []);

  useEffect(() => {
    if (!isModelMenuOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        modelMenuRef.current !== null &&
        !modelMenuRef.current.contains(event.target as Node)
      ) {
        setIsModelMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isModelMenuOpen]);

  useEffect(() => {
    if (previewAttachment === null) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setPreviewAttachment(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [previewAttachment]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (textarea === null) return;
    textarea.style.height = "0px";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 58), 160);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 160 ? "auto" : "hidden";
    setTextareaHeight(nextHeight);
  }, [value, expanded]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea === null) return;
    return registerComposer(textarea);
  }, [registerComposer]);

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const availableSlots = Math.max(
      0,
      ASSISTANT_PROMPT_MAX_ATTACHMENTS - attachments.length,
    );
    const accepted: AssistantPromptAttachment[] = [];
    let rejected = false;
    let rejectedForCapacity = false;

    for (const file of files) {
      if (
        !file.type.startsWith("image/") ||
        file.size > ASSISTANT_PROMPT_MAX_ATTACHMENT_BYTES
      ) {
        rejected = true;
        continue;
      }
      if (accepted.length >= availableSlots) {
        rejected = true;
        rejectedForCapacity = true;
        continue;
      }
      accepted.push({
        file,
        id: createAttachmentId(file),
        name: file.name,
        size: file.size,
        type: file.type,
        url: URL.createObjectURL(file),
      });
    }

    if (accepted.length > 0) {
      setAttachments((current) => [...current, ...accepted]);
    }
    if (rejected) {
      setFutureNotice(
        rejectedForCapacity
          ? "最多添加 6 个图片附件。"
          : "仅支持 10MB 以内的图片，且最多添加 6 个。",
      );
    } else {
      setFutureNotice("");
    }
  };

  const removeAttachment = (attachment: AssistantPromptAttachment) => {
    URL.revokeObjectURL(attachment.url);
    setAttachments((current) =>
      current.filter((candidate) => candidate.id !== attachment.id),
    );
    if (previewAttachment?.id === attachment.id) setPreviewAttachment(null);
  };

  const submit = () => {
    if (!canAttemptSubmit) return;
    onSubmit({ attachments: [], value: value.trim() });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    ) {
      return;
    }
    event.preventDefault();
    submit();
  };

  return (
    <>
      <form
        aria-label={ariaLabel}
        className="assistant-prompt-input"
        data-expanded={expanded}
        data-variant={variant}
        onSubmit={handleSubmit}
      >
        <input
          accept="image/*"
          aria-label="选择图片附件"
          className="assistant-prompt-input__file"
          multiple
          onChange={addFiles}
          ref={fileInputRef}
          type="file"
        />

        {attachments.length > 0 ? (
          <div
            aria-label="已添加图片附件"
            className="assistant-prompt-input__attachments"
          >
            {attachments.map((attachment) => (
              <div
                className="assistant-prompt-input__attachment"
                key={attachment.id}
              >
                <button
                  aria-label={`预览 ${attachment.name}`}
                  className="assistant-prompt-input__attachment-preview"
                  onClick={() => setPreviewAttachment(attachment)}
                  type="button"
                >
                  {/* Local object URLs cannot use the app's remote image optimizer. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={attachment.name} src={attachment.url} />
                </button>
                <button
                  aria-label={`移除 ${attachment.name}`}
                  className="assistant-prompt-input__attachment-remove"
                  onClick={() => removeAttachment(attachment)}
                  type="button"
                >
                  <X aria-hidden="true" size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="assistant-prompt-input__surface">
          <textarea
            aria-describedby={composerHelpId}
            aria-invalid={overLimit ? "true" : undefined}
            aria-label={inputLabel}
            disabled={disabled}
            onBlur={() => setIsFocused(false)}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => setIsFocused(true)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题，Shift + Enter 换行"
            ref={textareaRef}
            rows={1}
            style={{ height: `${textareaHeight}px` }}
            value={value}
          />

          <div className="assistant-prompt-input__toolbar">
            <div className="assistant-prompt-input__future-actions">
              <div className="assistant-prompt-input__model" ref={modelMenuRef}>
                <button
                  aria-expanded={isModelMenuOpen}
                  aria-haspopup="menu"
                  aria-label="选择模型，当前码多多"
                  className="assistant-prompt-input__tool-button"
                  onClick={() => setIsModelMenuOpen((current) => !current)}
                  type="button"
                >
                  <Sparkles aria-hidden="true" size={14} />
                  <span>码多多</span>
                </button>
                {isModelMenuOpen ? (
                  <div
                    aria-label="模型选择"
                    className="assistant-prompt-input__model-menu"
                    role="menu"
                  >
                    <button
                      aria-current="true"
                      className="assistant-prompt-input__model-option"
                      role="menuitem"
                      type="button"
                    >
                      <span>码多多</span>
                      <Check aria-hidden="true" size={14} />
                    </button>
                    <button
                      className="assistant-prompt-input__model-option"
                      disabled
                      role="menuitem"
                      type="button"
                    >
                      视觉模型 · 即将开放
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                aria-label="语音输入（即将开放）"
                className="assistant-prompt-input__tool-button"
                onClick={() => setFutureNotice("语音输入即将开放。")}
                type="button"
              >
                <Mic aria-hidden="true" size={14} />
                <span>语音</span>
              </button>
            </div>

            <button
              aria-label="添加图片附件"
              className="assistant-prompt-input__attach"
              disabled={
                disabled ||
                attachments.length >= ASSISTANT_PROMPT_MAX_ATTACHMENTS
              }
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <Paperclip aria-hidden="true" size={16} />
            </button>
            <button
              aria-label={disabled ? "发送中" : submitLabel}
              className="assistant-prompt-input__submit"
              disabled={!canSubmit}
              type="submit"
            >
              {disabled ? "发送中" : <ArrowUp aria-hidden="true" size={17} />}
            </button>
          </div>

          <p
            className="assistant-prompt-input__feedback"
            data-error={overLimit || Boolean(validationMessage)}
            id={composerHelpId}
          >
            {feedbackMessage}
          </p>
        </div>
      </form>

      {previewAttachment ? (
        <div
          aria-label={`预览 ${previewAttachment.name}`}
          aria-modal="true"
          className="assistant-prompt-input__preview"
          onClick={() => setPreviewAttachment(null)}
          role="dialog"
        >
          <div
            className="assistant-prompt-input__preview-card"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Local object URLs cannot use the app's remote image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={previewAttachment.name} src={previewAttachment.url} />
            <button
              aria-label="关闭预览"
              className="assistant-prompt-input__preview-close"
              onClick={() => setPreviewAttachment(null)}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
