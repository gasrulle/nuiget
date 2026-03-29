/**
 * Test helper factories for frontend (React/jsdom) tests.
 * Provides rendering wrappers and mock webview API.
 */
import { render, type RenderOptions } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';

interface MockVsCodeApi {
    postMessage: ReturnType<typeof vi.fn>;
    getState: ReturnType<typeof vi.fn>;
    setState: ReturnType<typeof vi.fn>;
}

/**
 * Get the current mock of acquireVsCodeApi's return value.
 * Useful for asserting on postMessage calls.
 */
export function getMockVsCodeApi(): MockVsCodeApi {
    const acquireFn = globalThis.acquireVsCodeApi as ReturnType<typeof vi.fn>;
    return acquireFn() as MockVsCodeApi;
}

/**
 * Render a component in a test environment.
 * Uses @testing-library/react's render with optional wrapper.
 */
export function renderComponent(
    ui: React.ReactElement,
    options?: Omit<RenderOptions, 'queries'>,
) {
    return render(ui, options);
}

/**
 * Simulate a message from the extension to the webview.
 * Fires a `message` event on `window` with the given data payload.
 */
export function simulateExtensionMessage(data: Record<string, unknown>): void {
    window.dispatchEvent(new MessageEvent('message', { data }));
}

/**
 * Wait for all React state updates to settle.
 */
export async function flushUpdates(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0));
}
