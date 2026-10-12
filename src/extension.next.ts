import * as vscode from 'vscode';

/**
 * Placeholder entry point built by `node esbuild.mjs --v2`.
 * Plan item P2.10 replaces it with the 2.0 composition root.
 */
export function activate(_context: vscode.ExtensionContext): void {
    void vscode.window.showInformationMessage('nUIget 2.0 is not wired yet');
}

export function deactivate(): void {
    // Nothing to release until the 2.0 composition root exists.
}
