"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import {
  ADMIN_MODEL_PROVIDERS,
  isAdminModelConfigSnapshot,
  type AdminModelConfigItem,
  type AdminModelConfigSnapshot,
  type AdminModelProvider,
} from "@/features/assistant/admin-model-config-contract";
import {
  useModelKeyReveal,
  type ModelKeyRevealError,
} from "./use-model-key-reveal";

type AssistantModelConfigPanelProps = {
  initialSnapshot: AdminModelConfigSnapshot;
  navigateToReauth?: (path: "/staff/re-auth") => void;
};

type PendingAction = "save" | "activate" | "refresh" | null;

function navigateToStaffReauth(path: "/staff/re-auth") {
  window.location.assign(path);
}

type UnknownMutationDescriptor =
  | {
      action: "save";
      provider: AdminModelProvider;
      submittedRevision: number;
      expectedNextRevision: number;
      modelId: string;
      endpointId: string;
      enteredAt: number;
      deadline: number;
    }
  | {
      action: "activate";
      provider: AdminModelProvider;
      submittedRevision: number;
      enteredAt: number;
      deadline: number;
    };

const LIST_ENDPOINT = "/api/v1/admin/assistant/model-configs";
const MODEL_EDITOR_ID = "assistant-model-editor";
const MODEL_ID_MAX_LENGTH = 128;
const API_KEY_MIN_LENGTH = 8;
const API_KEY_MAX_LENGTH = 4_096;
const SAVE_RECONCILIATION_WINDOW_MS = 10_000;
const TEST_RECONCILIATION_WINDOW_MS = 60_000;
const UNKNOWN_RESULT_MESSAGE = "操作结果未知，必须刷新配置后才能继续。";
const TEST_FAILURE_CODES = new Set([
  "credential_rejected",
  "model_not_found",
  "provider_unreachable",
  "provider_timeout",
]);
const UNCERTAIN_MUTATION_ERROR_CODES = new Set([
  "storage_unavailable",
  "assistant_unavailable",
]);

function hasExactKeys(value: unknown, expected: readonly string[]) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseListResponse(value: unknown): AdminModelConfigSnapshot | null {
  if (
    !hasExactKeys(value, [
      "version",
      "configs",
      "endpoints",
      "runtime",
      "canConfigure",
      "canReveal",
      "controlEnabled",
      "requestId",
    ])
  ) {
    return null;
  }
  const envelope = value as Record<string, unknown>;
  if (!isRequestId(envelope.requestId)) return null;
  const candidate = {
    version: envelope.version,
    configs: envelope.configs,
    endpoints: envelope.endpoints,
    runtime: envelope.runtime,
    canConfigure: envelope.canConfigure,
    canReveal: envelope.canReveal,
    controlEnabled: envelope.controlEnabled,
  };
  return isAdminModelConfigSnapshot(candidate) ? candidate : null;
}

function parseSavedSnapshot(
  value: unknown,
  provider: AdminModelProvider,
  current: AdminModelConfigSnapshot,
): AdminModelConfigSnapshot | null {
  if (!hasExactKeys(value, ["version", "requestId", "config"])) return null;
  const envelope = value as Record<string, unknown>;
  if (envelope.version !== "1" || !isRequestId(envelope.requestId)) return null;
  if (
    !hasExactKeys(envelope.config, [
      "provider",
      "displayName",
      "modelId",
      "endpointId",
      "revision",
      "testStatus",
      "lastTestedAt",
      "apiKey",
      "activeRevision",
    ])
  ) {
    return null;
  }
  const raw = envelope.config as Record<string, unknown>;
  if (raw.provider !== provider) return null;
  const previous = current.configs.find(
    (config) => config.provider === provider,
  );
  if (previous === undefined) return null;
  const saved = {
    provider: raw.provider,
    displayName: raw.displayName,
    modelId: raw.modelId,
    endpointId: raw.endpointId,
    revision: raw.revision,
    testStatus: raw.testStatus,
    lastTestedAt: raw.lastTestedAt,
    apiKey: raw.apiKey,
    activeRevision: previous.activeRevision,
  } as AdminModelConfigItem;
  const candidate = {
    ...current,
    configs: current.configs.map((config) =>
      config.provider === provider ? saved : config,
    ),
  };
  return isAdminModelConfigSnapshot(candidate) ? candidate : null;
}

type Activation = {
  provider: AdminModelProvider;
  configRevision: number;
  activationVersion: number;
};

function parseActivation(
  value: unknown,
  requestedProvider: AdminModelProvider,
  requestedRevision: number,
): Activation | null {
  if (!hasExactKeys(value, ["version", "requestId", "activation"])) {
    return null;
  }
  const envelope = value as Record<string, unknown>;
  if (envelope.version !== "1" || !isRequestId(envelope.requestId)) return null;
  if (
    !hasExactKeys(envelope.activation, [
      "provider",
      "configRevision",
      "activationVersion",
    ])
  ) {
    return null;
  }
  const activation = envelope.activation as Record<string, unknown>;
  if (
    activation.provider !== requestedProvider ||
    activation.configRevision !== requestedRevision ||
    typeof activation.activationVersion !== "number" ||
    !Number.isSafeInteger(activation.activationVersion) ||
    activation.activationVersion < 1
  ) {
    return null;
  }
  return {
    provider: requestedProvider,
    configRevision: requestedRevision,
    activationVersion: activation.activationVersion,
  };
}

type SafeError = { code: string; redirectTo: "/staff/re-auth" | null };

function parseSafeError(value: unknown): SafeError | null {
  const hasRedirect = hasExactKeys(value, [
    "version",
    "requestId",
    "error",
    "redirectTo",
  ]);
  if (!hasRedirect && !hasExactKeys(value, ["version", "requestId", "error"])) {
    return null;
  }
  const envelope = value as Record<string, unknown>;
  if (envelope.version !== "1" || !isRequestId(envelope.requestId)) return null;
  if (!hasExactKeys(envelope.error, ["code", "message", "retryable"])) {
    return null;
  }
  const error = envelope.error as Record<string, unknown>;
  if (typeof error.code !== "string" || typeof error.retryable !== "boolean") {
    return null;
  }
  if (hasRedirect) {
    if (
      error.code !== "reauth_required" ||
      envelope.redirectTo !== "/staff/re-auth"
    ) {
      return null;
    }
    return { code: error.code, redirectTo: "/staff/re-auth" };
  }
  return { code: error.code, redirectTo: null };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function statusText(
  config: AdminModelConfigItem,
  runtime: AdminModelConfigSnapshot["runtime"],
): string {
  if (config.revision === null) {
    if (
      runtime.source === "deployment" &&
      runtime.provider === config.provider
    ) {
      return "部署配置正在运行 · 后台 Key 不可查看";
    }
    return "未配置";
  }
  if (config.activeRevision === config.revision) {
    return config.testStatus === "failed"
      ? `当前启用配置测试失败 · 仍运行 rev ${config.activeRevision}`
      : "已启用";
  }
  if (config.activeRevision !== null) {
    return config.testStatus === "failed"
      ? `当前草稿测试失败 · 仍运行 rev ${config.activeRevision}`
      : `当前草稿未启用 · 运行 rev ${config.activeRevision}`;
  }
  return config.testStatus === "failed" ? "测试失败" : "已配置";
}

function safeFailureMessage(error: SafeError | null): string {
  switch (error?.code) {
    case "configuration_conflict":
      return "配置已发生变化，请刷新后重试。";
    case "control_disabled":
      return "模型配置控制已关闭。";
    case "permission_denied":
    case "authentication_required":
      return "当前账号无权执行此操作。";
    case "validation_error":
    case "endpoint_not_allowed":
      return "配置内容无效，请检查后重试。";
    default:
      return "模型配置操作失败，请稍后重试。";
  }
}

function safeRevealFailureMessage(error: ModelKeyRevealError | null): string {
  switch (error?.code) {
    case "permission_denied":
      return "当前账号无权查看模型密钥。";
    case "rate_limited":
      return "查看过于频繁，请稍后重试。";
    case "storage_unavailable":
    case "unavailable":
    case "reauth_required":
    default:
      return "模型密钥暂时无法查看，请稍后重试。";
  }
}

function snapshotProvesMutation(
  snapshot: AdminModelConfigSnapshot,
  descriptor: UnknownMutationDescriptor,
): boolean {
  if (descriptor.action !== "save") return false;
  const config = snapshot.configs.find(
    (candidate) => candidate.provider === descriptor.provider,
  );
  if (config === undefined) return false;
  return (
    config.revision === descriptor.expectedNextRevision &&
    config.modelId === descriptor.modelId &&
    config.endpointId === descriptor.endpointId
  );
}

export function AssistantModelConfigPanel({
  initialSnapshot,
  navigateToReauth = navigateToStaffReauth,
}: AssistantModelConfigPanelProps) {
  const initialConfig = initialSnapshot.configs.find(
    (config) => config.provider === "openai",
  )!;
  const [snapshot, setSnapshot] =
    useState<AdminModelConfigSnapshot>(initialSnapshot);
  const [selectedProvider, setSelectedProvider] =
    useState<AdminModelProvider>("openai");
  const [modelId, setModelId] = useState(initialConfig.modelId ?? "");
  const [endpointId, setEndpointId] = useState(
    initialConfig.endpointId ?? initialSnapshot.endpoints.openai[0]?.id ?? "",
  );
  const [apiKey, setApiKey] = useState("");
  const [validation, setValidation] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState<PendingAction>(null);
  const [syncRequired, setSyncRequired] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const copyGenerationRef = useRef(0);
  const copyMountedRef = useRef(true);
  const copyPlaintextRef = useRef<string | null>(null);
  const activeController = useRef<AbortController | null>(null);
  const operationGeneration = useRef(0);
  const pendingRef = useRef(false);
  const pendingActionRef = useRef<PendingAction>(null);
  const pendingMutationRef = useRef<UnknownMutationDescriptor | null>(null);
  const unknownDescriptorRef = useRef<UnknownMutationDescriptor | null>(null);
  const syncRequiredRef = useRef(false);
  const pageSuspendedRef = useRef(false);
  const selectedProviderRef = useRef<AdminModelProvider>("openai");
  const providerTabs = useRef<
    Partial<Record<AdminModelProvider, HTMLButtonElement>>
  >({});
  const keyReveal = useModelKeyReveal(selectedProvider);

  const selectedConfig = useMemo(
    () =>
      snapshot.configs.find((config) => config.provider === selectedProvider)!,
    [selectedProvider, snapshot.configs],
  );
  const endpointOptions = snapshot.endpoints[selectedProvider];
  const writable = snapshot.canConfigure && snapshot.controlEnabled;
  const controlUnavailable =
    !snapshot.controlEnabled && snapshot.runtime.capability === "degraded";
  const canMutate = writable && !syncRequired && keyReveal.status !== "loading";
  const keyRequired = selectedConfig.apiKey === null;
  const hasDynamicSavedKey =
    selectedConfig.revision !== null &&
    selectedConfig.apiKey?.configured === true;
  const canRevealSelectedKey =
    snapshot.canReveal && snapshot.controlEnabled && hasDynamicSavedKey;

  const invalidateCopyFeedback = useCallback(() => {
    copyGenerationRef.current += 1;
    copyPlaintextRef.current = null;
    if (copyMountedRef.current) setCopyStatus("");
  }, []);

  useLayoutEffect(() => {
    copyPlaintextRef.current = keyReveal.plaintext;
  }, [keyReveal.plaintext]);

  const requireSync = useCallback(
    (
      descriptor: UnknownMutationDescriptor | null = pendingMutationRef.current,
    ) => {
      if (descriptor !== null) unknownDescriptorRef.current = descriptor;
      syncRequiredRef.current = true;
      setSyncRequired(true);
      setAnnouncement(UNKNOWN_RESULT_MESSAGE);
      setApiKey("");
    },
    [],
  );

  const abortForLifecycle = useCallback(() => {
    const mutation = pendingMutationRef.current;
    const resultBecameUnknown =
      pendingActionRef.current === "save" ||
      pendingActionRef.current === "activate";
    operationGeneration.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    pendingRef.current = false;
    pendingActionRef.current = null;
    pendingMutationRef.current = null;
    setPending(null);
    setApiKey("");
    if (resultBecameUnknown) requireSync(mutation);
    return resultBecameUnknown;
  }, [requireSync]);

  const startOperation = useCallback((action: Exclude<PendingAction, null>) => {
    if (pendingRef.current) return null;
    pendingRef.current = true;
    pendingActionRef.current = action;
    setPending(action);
    const controller = new AbortController();
    activeController.current = controller;
    return {
      controller,
      generation: ++operationGeneration.current,
    };
  }, []);

  const settleOperation = useCallback((generation: number) => {
    if (operationGeneration.current !== generation) return false;
    activeController.current = null;
    pendingRef.current = false;
    pendingActionRef.current = null;
    pendingMutationRef.current = null;
    setPending(null);
    setApiKey("");
    return true;
  }, []);

  const refreshSnapshot = useCallback(
    async (signal: AbortSignal): Promise<AdminModelConfigSnapshot | null> => {
      const response = await fetch(LIST_ENDPOINT, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      if (!response.ok) return null;
      return parseListResponse(await readJson(response));
    },
    [],
  );

  const selectProvider = (provider: AdminModelProvider) => {
    if (provider === selectedProvider) return;
    invalidateCopyFeedback();
    keyReveal.hide();
    if (
      pendingActionRef.current === "save" ||
      pendingActionRef.current === "activate"
    ) {
      abortForLifecycle();
    } else {
      setApiKey("");
    }
    const nextConfig = snapshot.configs.find(
      (config) => config.provider === provider,
    )!;
    setModelId(nextConfig.modelId ?? "");
    setEndpointId(
      nextConfig.endpointId ?? snapshot.endpoints[provider][0]?.id ?? "",
    );
    setValidation("");
    if (!syncRequiredRef.current) setAnnouncement("");
    selectedProviderRef.current = provider;
    setSelectedProvider(provider);
  };

  const handleProviderKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    provider: AdminModelProvider,
  ) => {
    const currentIndex = ADMIN_MODEL_PROVIDERS.indexOf(provider);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % ADMIN_MODEL_PROVIDERS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex =
        (currentIndex - 1 + ADMIN_MODEL_PROVIDERS.length) %
        ADMIN_MODEL_PROVIDERS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = ADMIN_MODEL_PROVIDERS.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const nextProvider = ADMIN_MODEL_PROVIDERS[nextIndex]!;
    selectProvider(nextProvider);
    providerTabs.current[nextProvider]?.focus();
  };

  const replaceSnapshot = useCallback((next: AdminModelConfigSnapshot) => {
    const provider = selectedProviderRef.current;
    const nextConfig = next.configs.find(
      (config) => config.provider === provider,
    )!;
    setSnapshot(next);
    setModelId(nextConfig.modelId ?? "");
    setEndpointId(
      nextConfig.endpointId ?? next.endpoints[provider][0]?.id ?? "",
    );
    setValidation("");
  }, []);

  const validateDraft = () => {
    const normalizedModelId = modelId.trim();
    if (
      normalizedModelId.length === 0 ||
      Array.from(normalizedModelId).length > MODEL_ID_MAX_LENGTH ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(normalizedModelId) ||
      /(?:[a-z][a-z0-9+.-]*:\/\/|\/\/)/iu.test(normalizedModelId)
    ) {
      setValidation("Model ID 必须是 1–128 个安全字符。");
      return null;
    }
    if (!endpointOptions.some((option) => option.id === endpointId)) {
      setValidation("请选择部署允许的 Endpoint。");
      return null;
    }
    const keyLength = Array.from(apiKey).length;
    if (
      (apiKey.length > 0 &&
        (keyLength < API_KEY_MIN_LENGTH ||
          keyLength > API_KEY_MAX_LENGTH ||
          /\s/u.test(apiKey) ||
          /[\u0000-\u001f\u007f-\u009f]/u.test(apiKey))) ||
      (selectedConfig.apiKey === null && apiKey.length === 0)
    ) {
      setValidation(
        selectedConfig.apiKey === null && apiKey.length === 0
          ? "首次配置必须填写 API Key。"
          : "API Key 格式无效。",
      );
      return null;
    }
    setValidation("");
    return {
      modelId: normalizedModelId,
      endpointId,
      ...(apiKey.length === 0 ? {} : { apiKey }),
      expectedRevision: selectedConfig.revision ?? 0,
    };
  };

  const handleFailure = (error: SafeError | null) => {
    if (error?.redirectTo === "/staff/re-auth") {
      setAnnouncement("需要重新验证身份，正在前往验证页面。");
      navigateToReauth("/staff/re-auth");
      return;
    }
    setAnnouncement(safeFailureMessage(error));
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!writable || syncRequiredRef.current || pendingRef.current) return;
    const input = validateDraft();
    if (input === null) return;
    invalidateCopyFeedback();
    keyReveal.hide();
    const operation = startOperation("save");
    if (operation === null) return;
    const provider = selectedProvider;
    const enteredAt = Date.now();
    pendingMutationRef.current = {
      action: "save",
      provider,
      submittedRevision: input.expectedRevision,
      expectedNextRevision: input.expectedRevision + 1,
      modelId: input.modelId,
      endpointId: input.endpointId,
      enteredAt,
      deadline: enteredAt + SAVE_RECONCILIATION_WINDOW_MS,
    };
    try {
      const response = await fetch(`${LIST_ENDPOINT}/${provider}`, {
        method: "PUT",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: operation.controller.signal,
      });
      const body = await readJson(response);
      if (operationGeneration.current !== operation.generation) return;
      if (!response.ok) {
        const error = parseSafeError(body);
        if (error === null) {
          requireSync();
        } else if (error.redirectTo === "/staff/re-auth") {
          handleFailure(error);
        } else if (UNCERTAIN_MUTATION_ERROR_CODES.has(error.code)) {
          requireSync();
        } else {
          handleFailure(error);
        }
        return;
      }
      const saved = parseSavedSnapshot(body, provider, snapshot);
      if (saved === null) {
        requireSync();
        return;
      }
      replaceSnapshot(saved);
      const refreshed = await refreshSnapshot(operation.controller.signal);
      if (operationGeneration.current !== operation.generation) return;
      if (refreshed === null) {
        requireSync();
      } else {
        replaceSnapshot(refreshed);
        setAnnouncement("保存成功，配置状态已刷新。");
      }
    } catch {
      if (operationGeneration.current === operation.generation) {
        requireSync();
      }
    } finally {
      settleOperation(operation.generation);
    }
  };

  const refresh = useCallback(async () => {
    const wasSyncRequired = syncRequiredRef.current;
    const descriptor = unknownDescriptorRef.current;
    const operation = startOperation("refresh");
    if (operation === null) return;
    try {
      const refreshed = await refreshSnapshot(operation.controller.signal);
      if (operationGeneration.current !== operation.generation) return;
      if (refreshed === null) {
        setAnnouncement(
          wasSyncRequired
            ? UNKNOWN_RESULT_MESSAGE
            : "配置状态刷新失败，请稍后重试。",
        );
      } else {
        replaceSnapshot(refreshed);
        const canResolveUnknown =
          wasSyncRequired &&
          descriptor !== null &&
          descriptor === unknownDescriptorRef.current &&
          (Date.now() >= descriptor.deadline ||
            snapshotProvesMutation(refreshed, descriptor));
        if (canResolveUnknown) {
          unknownDescriptorRef.current = null;
          syncRequiredRef.current = false;
          setSyncRequired(false);
          setAnnouncement("配置状态已刷新，可以继续操作。");
        } else {
          setAnnouncement(
            wasSyncRequired ? UNKNOWN_RESULT_MESSAGE : "配置状态已刷新。",
          );
        }
      }
    } catch {
      if (operationGeneration.current === operation.generation) {
        setAnnouncement(
          wasSyncRequired
            ? UNKNOWN_RESULT_MESSAGE
            : "配置状态刷新失败，请稍后重试。",
        );
      }
    } finally {
      settleOperation(operation.generation);
    }
  }, [refreshSnapshot, replaceSnapshot, settleOperation, startOperation]);

  useEffect(() => {
    if (!syncRequired) return;
    const descriptor = unknownDescriptorRef.current;
    if (descriptor === null) return;
    const timer = window.setTimeout(
      () => {
        if (pageSuspendedRef.current || document.visibilityState === "hidden") {
          return;
        }
        void refresh();
      },
      Math.max(0, descriptor.deadline - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [refresh, syncRequired]);

  useEffect(() => {
    const handlePageHide = () => {
      pageSuspendedRef.current = true;
      invalidateCopyFeedback();
      abortForLifecycle();
    };
    const handlePageShow = () => {
      pageSuspendedRef.current = false;
      if (syncRequiredRef.current) void refresh();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        invalidateCopyFeedback();
        abortForLifecycle();
      } else if (syncRequiredRef.current) {
        void refresh();
      }
    };
    copyMountedRef.current = true;
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
      copyMountedRef.current = false;
      invalidateCopyFeedback();
      operationGeneration.current += 1;
      activeController.current?.abort();
      activeController.current = null;
      pendingRef.current = false;
      pendingActionRef.current = null;
      pendingMutationRef.current = null;
    };
  }, [abortForLifecycle, invalidateCopyFeedback, refresh]);

  useEffect(() => {
    if (keyReveal.error?.redirectTo === "/staff/re-auth") {
      navigateToReauth("/staff/re-auth");
    }
  }, [keyReveal.error, navigateToReauth]);

  const testAndActivate = async () => {
    if (
      !writable ||
      syncRequiredRef.current ||
      selectedConfig.revision === null ||
      pendingRef.current
    ) {
      return;
    }
    const operation = startOperation("activate");
    if (operation === null) return;
    invalidateCopyFeedback();
    keyReveal.hide();
    const provider = selectedProvider;
    const revision = selectedConfig.revision;
    const enteredAt = Date.now();
    pendingMutationRef.current = {
      action: "activate",
      provider,
      submittedRevision: revision,
      enteredAt,
      deadline: enteredAt + TEST_RECONCILIATION_WINDOW_MS,
    };
    try {
      const response = await fetch(
        `${LIST_ENDPOINT}/${provider}/test-and-activate`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision }),
          signal: operation.controller.signal,
        },
      );
      const body = await readJson(response);
      if (operationGeneration.current !== operation.generation) return;
      if (!response.ok) {
        const error = parseSafeError(body);
        if (error === null) {
          requireSync();
          return;
        }
        if (error.redirectTo === "/staff/re-auth") {
          handleFailure(error);
          return;
        }
        if (UNCERTAIN_MUTATION_ERROR_CODES.has(error.code)) {
          requireSync();
          return;
        }
        if (!TEST_FAILURE_CODES.has(error.code)) {
          handleFailure(error);
          return;
        }
        const refreshed = await refreshSnapshot(operation.controller.signal);
        if (operationGeneration.current !== operation.generation) return;
        if (refreshed === null) {
          requireSync();
          return;
        }
        replaceSnapshot(refreshed);
        setAnnouncement("模型测试失败，配置状态已刷新。");
        return;
      }
      const activation = parseActivation(body, provider, revision);
      if (activation === null) {
        requireSync();
        return;
      }
      const refreshed = await refreshSnapshot(operation.controller.signal);
      if (operationGeneration.current !== operation.generation) return;
      if (refreshed === null) {
        requireSync();
        return;
      }
      replaceSnapshot(refreshed);
      setAnnouncement(
        `测试通过，已启用 ${selectedConfig.displayName} rev ${revision}。`,
      );
    } catch {
      if (operationGeneration.current === operation.generation) {
        requireSync();
      }
    } finally {
      settleOperation(operation.generation);
    }
  };

  const showRefresh =
    syncRequired || announcement === "配置已发生变化，请刷新后重试。";

  const revealKey = () => {
    if (
      !canRevealSelectedKey ||
      syncRequired ||
      pending !== null ||
      selectedConfig.revision === null
    ) {
      return;
    }
    invalidateCopyFeedback();
    void keyReveal.reveal(selectedProvider, selectedConfig.revision);
  };

  const hideRevealedKey = () => {
    invalidateCopyFeedback();
    keyReveal.hide();
  };

  const copyKey = async () => {
    const plaintext = keyReveal.plaintext;
    if (plaintext === null) return;
    const provider = selectedProvider;
    const generation = ++copyGenerationRef.current;
    copyPlaintextRef.current = plaintext;
    setCopyStatus("");
    try {
      await navigator.clipboard.writeText(plaintext);
      if (
        !copyMountedRef.current ||
        copyGenerationRef.current !== generation ||
        selectedProviderRef.current !== provider ||
        copyPlaintextRef.current !== plaintext
      ) {
        return;
      }
      setCopyStatus("密钥已复制。");
    } catch {
      if (
        !copyMountedRef.current ||
        copyGenerationRef.current !== generation ||
        selectedProviderRef.current !== provider ||
        copyPlaintextRef.current !== plaintext
      ) {
        return;
      }
      setCopyStatus("复制失败，请手动选择密钥。");
    }
  };

  return (
    <section
      aria-labelledby="assistant-model-config-title"
      className="assistant-model-config"
    >
      <header className="assistant-model-config__heading">
        <div>
          <p>CLOUD MODEL CONTROL</p>
          <h2 id="assistant-model-config-title">云模型配置</h2>
          <span>保存草稿后测试并启用；测试失败不会切换当前模型。</span>
        </div>
        <strong>
          {snapshot.controlEnabled
            ? "控制面已启用"
            : controlUnavailable
              ? "控制面暂不可用"
              : "部署已关闭控制面"}
        </strong>
      </header>

      <div className="assistant-model-config__layout">
        <div
          aria-label="云模型 Provider"
          className="assistant-model-config__providers"
          role="tablist"
        >
          {ADMIN_MODEL_PROVIDERS.map((provider) => {
            const config = snapshot.configs.find(
              (item) => item.provider === provider,
            )!;
            const deploymentRunning =
              snapshot.runtime.source === "deployment" &&
              snapshot.runtime.provider === provider;
            const running = config.activeRevision !== null || deploymentRunning;
            return (
              <button
                aria-controls={MODEL_EDITOR_ID}
                aria-selected={provider === selectedProvider}
                id={`assistant-model-provider-tab-${provider}`}
                key={provider}
                onClick={() => selectProvider(provider)}
                onKeyDown={(event) => handleProviderKeyDown(event, provider)}
                ref={(element) => {
                  if (element === null) {
                    delete providerTabs.current[provider];
                  } else {
                    providerTabs.current[provider] = element;
                  }
                }}
                role="tab"
                tabIndex={provider === selectedProvider ? 0 : -1}
                type="button"
              >
                <span>
                  <strong>{config.displayName}</strong>
                  {running ? <em>运行中</em> : null}
                </span>
                <small>{statusText(config, snapshot.runtime)}</small>
                {config.lastTestedAt === null ? null : (
                  <time dateTime={config.lastTestedAt}>
                    最近测试 {config.lastTestedAt}
                  </time>
                )}
              </button>
            );
          })}
        </div>

        <form
          aria-labelledby={`assistant-model-provider-tab-${selectedProvider}`}
          className="assistant-model-config__editor"
          id={MODEL_EDITOR_ID}
          onSubmit={save}
          role="tabpanel"
        >
          <header>
            <div>
              <span>当前 Provider</span>
              <h3 id="assistant-model-editor-title">
                <output aria-label="Provider">
                  {selectedConfig.displayName}
                </output>
              </h3>
            </div>
            <dl>
              <div>
                <dt>当前配置版本</dt>
                <dd>
                  {selectedConfig.revision === null
                    ? "无"
                    : `rev ${selectedConfig.revision}`}
                </dd>
              </div>
              <div>
                <dt>当前运行版本</dt>
                <dd>
                  {selectedConfig.activeRevision === null
                    ? snapshot.runtime.source === "deployment" &&
                      snapshot.runtime.provider === selectedProvider
                      ? "部署配置"
                      : "无"
                    : `rev ${selectedConfig.activeRevision}`}
                </dd>
              </div>
            </dl>
          </header>

          <div className="assistant-model-config__fields">
            <label>
              <span>Model ID</span>
              <input
                disabled={!writable}
                maxLength={MODEL_ID_MAX_LENGTH}
                onChange={(event) => setModelId(event.target.value)}
                value={modelId}
              />
            </label>
            <label>
              <span>Endpoint</span>
              <select
                disabled={!writable}
                onChange={(event) => setEndpointId(event.target.value)}
                value={endpointId}
              >
                {endpointOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                {keyRequired ? "新 API Key（必填）" : "新 API Key（可选）"}
              </span>
              <input
                aria-required={keyRequired}
                autoComplete="new-password"
                disabled={!writable}
                maxLength={API_KEY_MAX_LENGTH}
                onChange={(event) => setApiKey(event.target.value)}
                required={keyRequired}
                type="password"
                value={apiKey}
              />
            </label>
            <div className="assistant-model-config__key-status">
              <span>
                {selectedConfig.apiKey === null
                  ? "未保存后台 Key"
                  : `已配置 · 末四位 ${selectedConfig.apiKey.lastFour}`}
              </span>
              {canRevealSelectedKey ? (
                <button
                  disabled={
                    syncRequired ||
                    pending !== null ||
                    keyReveal.status === "loading"
                  }
                  onClick={revealKey}
                  type="button"
                >
                  {keyReveal.status === "loading"
                    ? "正在查看…"
                    : "查看已保存 Key"}
                </button>
              ) : null}
            </div>
          </div>

          {keyReveal.error === null ? null : (
            <p className="assistant-model-config__validation" role="alert">
              {keyReveal.error.code === "reauth_required"
                ? "需要重新验证身份，正在前往验证页面。"
                : safeRevealFailureMessage(keyReveal.error)}
            </p>
          )}

          {keyReveal.plaintext === null ? null : (
            <section
              aria-label="临时显示的模型密钥"
              className="assistant-model-config__reveal"
            >
              <header>
                <strong>已保存 Key</strong>
                <span>{keyReveal.secondsRemaining} 秒后隐藏</span>
              </header>
              <code>{keyReveal.plaintext}</code>
              <p>复制后由操作系统剪贴板负责保管，30 秒隐藏不会清除剪贴板。</p>
              <div>
                <button onClick={() => void copyKey()} type="button">
                  复制 Key
                </button>
                <button onClick={hideRevealedKey} type="button">
                  隐藏 Key
                </button>
                {copyStatus.length === 0 ? null : (
                  <span aria-live="polite">{copyStatus}</span>
                )}
              </div>
            </section>
          )}

          {validation.length === 0 ? null : (
            <p className="assistant-model-config__validation" role="alert">
              {validation}
            </p>
          )}

          <footer>
            <div aria-live="polite" role="status">
              {announcement ||
                (!snapshot.canConfigure
                  ? "仅可查看脱敏配置。"
                  : !snapshot.controlEnabled
                    ? controlUnavailable
                      ? "模型配置控制面暂不可用。"
                      : "部署级控制开关已关闭。"
                    : "等待配置操作。")}
              {showRefresh ? (
                <button
                  disabled={pending !== null}
                  onClick={() => void refresh()}
                  type="button"
                >
                  刷新配置
                </button>
              ) : null}
            </div>
            {snapshot.canConfigure ? (
              <div>
                <button disabled={!canMutate || pending !== null} type="submit">
                  {pending === "save" ? "保存中…" : "保存草稿"}
                </button>
                <button
                  disabled={
                    !canMutate ||
                    selectedConfig.revision === null ||
                    pending !== null
                  }
                  onClick={() => void testAndActivate()}
                  type="button"
                >
                  {pending === "activate" ? "测试中…" : "测试并启用"}
                </button>
              </div>
            ) : null}
          </footer>
        </form>
      </div>
    </section>
  );
}
