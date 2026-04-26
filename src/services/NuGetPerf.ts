import * as vscode from 'vscode';

/**
 * Lightweight performance instrumentation for nUIget.
 *
 * Gated behind the `nuiget.enablePerformanceLogging` setting; when disabled
 * every API is a no-op (no allocations, no log calls, no `performance.now()`).
 *
 * Logs are written to the existing nUIget LogOutputChannel as `[perf] <label> <ms>`.
 * In multi-root workspaces, project-scoped timers are tagged with the owning
 * `WorkspaceFolder.name` so a slow repo doesn't drown a fast one in averages.
 */

let enabled = false;
let outputChannel: vscode.LogOutputChannel | undefined;

const NOOP_TIMER: PerfTimer = {
    mark: () => { /* noop */ },
    end: () => 0,
};

export interface PerfTimer {
    /** Record an intermediate sub-phase boundary (delta since previous mark/start). */
    mark(phase: string): void;
    /** Finish the timer; logs total wall time and returns it (ms). */
    end(extra?: Record<string, unknown>): number;
}

/**
 * Initialize the perf module against an output channel and watch the setting.
 * Returns a disposable for the configuration listener.
 */
export function configurePerf(channel: vscode.LogOutputChannel): vscode.Disposable {
    outputChannel = channel;
    const reload = () => {
        const cfg = vscode.workspace.getConfiguration('nuiget');
        enabled = cfg.get<boolean>('enablePerformanceLogging', false);
    };
    reload();
    return vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('nuiget.enablePerformanceLogging')) {
            reload();
        }
    });
}

/** True when perf logging is currently enabled (cheap inline check for hot paths). */
export function isPerfEnabled(): boolean {
    return enabled;
}

/**
 * Start a perf timer.
 *
 * When the setting is off, returns a shared no-op timer (zero overhead).
 * When on, records `performance.now()` and returns a closure that emits one
 * line per `mark()` (sub-phase delta) and one summary line on `end()`.
 *
 * Pass a `projectPath` to tag the log with the owning workspace folder name
 * (only emitted when multiple workspace folders are open).
 */
export function startTimer(label: string, projectPath?: string): PerfTimer {
    if (!enabled || !outputChannel) {
        return NOOP_TIMER;
    }
    const start = performance.now();
    let lastMark = start;
    const folderTag = projectPath ? folderTagFor(projectPath) : '';
    const channel = outputChannel;
    return {
        mark(phase: string) {
            if (!enabled) { return; }
            const now = performance.now();
            const since = now - lastMark;
            channel.debug(`[perf]${folderTag} ${label} ${phase} ${since.toFixed(1)}ms`);
            lastMark = now;
        },
        end(extra?: Record<string, unknown>) {
            const total = performance.now() - start;
            if (enabled) {
                const extraStr = extra
                    ? ' ' + Object.entries(extra).map(([k, v]) => `${k}=${String(v)}`).join(' ')
                    : '';
                channel.info(`[perf]${folderTag} ${label} ${total.toFixed(1)}ms${extraStr}`);
            }
            return total;
        }
    };
}

/**
 * Convenience wrapper for instrumenting an `async` function with no sub-phases.
 * Always awaits and finalizes the timer, even on throw.
 */
export async function timed<T>(label: string, projectPath: string | undefined, fn: () => Promise<T>): Promise<T> {
    const t = startTimer(label, projectPath);
    try {
        return await fn();
    } finally {
        t.end();
    }
}

/**
 * Resolve the workspace folder tag for a given project path, but only emit
 * it when more than one workspace folder is open. In single-root setups the
 * tag is just noise.
 */
function folderTagFor(projectPath: string): string {
    try {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length < 2) { return ''; }
        const uri = vscode.Uri.file(projectPath);
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (folder) {
            return ` [${folder.name}]`;
        }
    } catch {
        /* noop — tagging is best-effort */
    }
    return '';
}

/** Test-only: force the enabled flag without touching VS Code config. */
export function _setEnabledForTests(value: boolean, channel?: vscode.LogOutputChannel): void {
    enabled = value;
    if (channel) { outputChannel = channel; }
}
