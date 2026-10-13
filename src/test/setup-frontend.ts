/**
 * Frontend test setup — runs before each frontend (jsdom) test file.
 * Imports jest-dom matchers, registers the axe matcher and sets up the acquireVsCodeApi global.
 */
import '@testing-library/jest-dom/vitest';
import { toHaveNoViolations } from 'jest-axe';
import { expect, vi } from 'vitest';

// `expect(await axe(container)).toHaveNoViolations()` in every frontend test (ADR-008: primitives have axe tests).
expect.extend(toHaveNoViolations);

declare module 'vitest' {
    // Vitest's own extension point for custom matchers; `Assertion` and the asymmetric matchers both extend it.
    // The type parameters repeat Vitest's declaration, which interface merging requires; `T` has no use here.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
        /** Passes when an axe result (`await axe(element)`) reports no violation. */
        toHaveNoViolations(): R;
    }
}

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
