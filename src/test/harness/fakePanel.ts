import { vi } from 'vitest';

interface DisposableLike { dispose(): void }

/**
 * A webview panel that reports its disposal once, as VS Code does. The shared mock's panel
 * (`src/test/__mocks__/vscode.ts`) fires `onDidDispose` on every `dispose()` and ignores the `disposables` argument,
 * so `MainPanelHost.dispose()`, which disposes its panel, recurses until the stack overflows (finding N58). Used by
 * the harness and by the composition root's test; hand it to `vscode.window.createWebviewPanel`.
 */
export function createFakePanel<W>(webview: W) {
    const listeners: Array<() => void> = [];
    let disposed = false;
    return {
        webview,
        iconPath: undefined as unknown,
        reveal: vi.fn(),
        onDidDispose: (listener: () => void, _thisArg?: unknown, disposables?: DisposableLike[]) => {
            listeners.push(listener);
            const entry = { dispose: () => undefined };
            disposables?.push(entry);
            return entry;
        },
        dispose: () => {
            if (!disposed) {
                disposed = true;
                listeners.forEach(listener => listener());
            }
        },
    };
}
