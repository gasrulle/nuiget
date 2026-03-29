/**
 * Frontend test setup — runs before each frontend (jsdom) test file.
 * Imports jest-dom matchers and sets up the acquireVsCodeApi global.
 */
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock acquireVsCodeApi — the VS Code webview global
const mockVsCodeApi = {
    postMessage: vi.fn(),
    getState: vi.fn(() => undefined),
    setState: vi.fn(),
};

Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    value: vi.fn(() => mockVsCodeApi),
    writable: true,
});
