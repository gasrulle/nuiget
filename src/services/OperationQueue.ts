import * as vscode from 'vscode';

/**
 * Process-wide FIFO queue for mutating NuGet package operations.
 *
 * Why this exists: every install/update/remove/bulk handler used to gate on a `_operationInProgress`
 * boolean and silently `break` if another op was active. Users would right-click package A → Update,
 * then right-click package B → Update, and the second click was dropped with no feedback.
 *
 * The queue serializes all mutations via a chained promise. Both NuGetPanel and NuGetSidebarPanel
 * enqueue through the same singleton, which also closes a latent cross-panel race on the same .csproj.
 *
 * Errors thrown by run() are caught and surfaced — the chain is never poisoned.
 */
class OperationQueue {
    private chain: Promise<void> = Promise.resolve();
    private waiting = 0;
    private active = 0;
    private static readonly MAX_WAITING = 5;
    private statusBar: vscode.StatusBarItem | undefined;

    /**
     * Queue a mutating package operation. Returns true if accepted, false if the queue is full.
     * `abortIf` is checked just before run() — used by panels to skip queued ops after disposal.
     */
    enqueue(label: string, run: () => Promise<void>, abortIf?: () => boolean): boolean {
        if (this.waiting >= OperationQueue.MAX_WAITING) {
            void vscode.window.showWarningMessage(
                `nUIget: too many queued operations (${OperationQueue.MAX_WAITING}). Please wait for the current batch to finish.`
            );
            return false;
        }
        this.waiting++;
        this.updateStatus();
        this.chain = this.chain.then(async () => {
            this.waiting--;
            this.active++;
            this.updateStatus();
            try {
                if (abortIf?.()) { return; }
                await run();
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[nUIget] queued operation '${label}' failed:`, err);
                void vscode.window.showErrorMessage(`nUIget: operation '${label}' failed: ${msg}`);
            } finally {
                this.active--;
                this.updateStatus();
            }
        });
        return true;
    }

    get isBusy(): boolean { return this.active > 0 || this.waiting > 0; }

    get pendingCount(): number { return this.waiting; }

    get activeCount(): number { return this.active; }

    /** Test hook: resolves once the queue has fully drained. */
    async waitIdle(): Promise<void> {
        // Snapshot the chain and wait. If new ops are appended afterwards, the caller is responsible
        // for re-awaiting waitIdle() until isBusy is false.
        let prev: Promise<void> | undefined;
        while (this.chain !== prev) {
            prev = this.chain;
            try { await prev; } catch { /* swallowed by run() wrapper anyway */ }
        }
    }

    private updateStatus(): void {
        const total = this.active + this.waiting;
        if (total === 0) {
            this.statusBar?.hide();
            return;
        }
        if (!this.statusBar) {
            this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        }
        this.statusBar.text = this.waiting > 0
            ? `$(sync~spin) nUIget: ${this.active} running, ${this.waiting} queued`
            : `$(sync~spin) nUIget: operation running`;
        this.statusBar.show();
    }

    /** Test hook: clear all state. Should NOT be used in production code paths. */
    resetForTests(): void {
        this.chain = Promise.resolve();
        this.waiting = 0;
        this.active = 0;
        this.statusBar?.dispose();
        this.statusBar = undefined;
    }
}

export const operationQueue = new OperationQueue();
export type { OperationQueue };
