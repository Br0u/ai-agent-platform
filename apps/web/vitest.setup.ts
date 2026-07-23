import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, vi } from "vitest";

globalThis.AsyncLocalStorage ??= AsyncLocalStorage;

vi.mock("server-only", () => ({}));

afterEach(cleanup);
