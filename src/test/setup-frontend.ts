/**
 * Frontend test setup — runs before each frontend (jsdom) test file.
 * Imports jest-dom matchers, registers the axe matcher and sets up the acquireVsCodeApi global.
 */
import '@testing-library/jest-dom/vitest';
import axeCore from 'axe-core';
import * as fs from 'fs';
import { toHaveNoViolations } from 'jest-axe';
import * as path from 'path';
import { afterAll, expect, inject, vi } from 'vitest';
import { type AxeRunResults, recordFor, wrapAxeRun } from './axeCoverage';

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

// UX-P0.25 (H88): every axe run of this file is recorded, and the file's rule outcomes are written for the frontend
// project's global setup (`src/test/axeCoverage.ts`), which fails the run when a pinned rule passed in no file.
const axeResults: AxeRunResults[] = [];
wrapAxeRun(axeCore as unknown as Parameters<typeof wrapAxeRun>[0], results => axeResults.push(results));
afterAll(() => {
    const dir = inject('axeLedgerDir');
    if (!dir) {
        return;
    }
    const testPath = path.relative(process.cwd(), expect.getState().testPath ?? 'unknown').split(path.sep).join('/');
    fs.writeFileSync(path.join(dir, `${testPath.replace(/[^A-Za-z0-9.-]/g, '_')}.json`), JSON.stringify(recordFor(testPath, axeResults)));
});
