/**
 * What VS Code shows about an operation (P9.9; D50, UX-P4.7): a progress notification while a bulk operation runs, a toast
 * for a bulk summary, a warning and a failure, and the output channel when one fails. A single success raises no toast: the
 * surface that asked shows it in place and says it in its live region; one the host started itself (the row menu) is said in
 * the status bar. `settleOperation` announces each ticket once, whichever
 * surface started it, so this one subscriber shows one toast per outcome with both surfaces open. A bulk operation is
 * the one whose progress reports carry `total`; a single operation and a rejected ticket open no notification.
 */

import * as vscode from 'vscode';
import type { Event } from '../core/contracts';
import type { BulkOutcome, EventPayload, OperationKind, OperationOutcome, OperationProgress } from '../protocol';
import { projectDisplayName } from './services';

export interface OperationFeedbackDeps {
    onProgress: Event<OperationProgress>;
    onCompleted: Event<EventPayload<'ops/completed'>>;
    /** What the host announces of the operations it submits itself (the row menu, `submitFromHost`): a `queued` report each. */
    onHostSubmitted: Event<OperationProgress>;
    output: Pick<vscode.LogOutputChannel, 'show'>;
}

type Report = { message: string };

interface OpenNotification {
    progress?: vscode.Progress<Report>;
    resolve?: () => void;
    /** A report that came before the notification's task started. */
    last?: Report;
    finished: boolean;
}

const TITLES: Record<OperationKind, string> = {
    install: 'nUIget: Installing packages',
    update: 'nUIget: Updating packages',
    remove: 'nUIget: Uninstalling packages',
    restore: 'nUIget: Restoring projects',
};

const PREFIX = 'nUIget: ';
/** The button of a failure toast, compared with the choice it returns. */
const SHOW_OUTPUT = 'Show Output';

/** A host reason inside a sentence that ends with its own period: the reason's trailing periods go (verbatim otherwise). */
const bare = (reason: string): string => reason.replace(/\.+$/, '');

const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;

/** The sentence of a single operation that did what it was asked. */
function doneSentence(outcome: OperationOutcome): string {
    const project = projectDisplayName(outcome.projectPath);
    const id = outcome.packageId ?? '';
    let sentence: string;
    switch (outcome.kind) {
        case 'install':
            sentence = `Installed ${id} ${outcome.version ?? ''}`.trimEnd() + ` in ${project}`;
            break;
        case 'update':
            sentence = `Updated ${id} to ${outcome.version ?? ''}`.trimEnd() + ` in ${project}`;
            break;
        case 'remove':
            sentence = `Uninstalled ${id} from ${project}`;
            break;
        default:
            sentence = `Restored ${project}`;
    }
    const others = outcome.affectedProjects?.length ?? 0;
    return others > 0 ? `${sentence}; also restored ${plural(others, 'other project')}` : sentence;
}

/** "Install of Serilog in App" and the like: what an operation that did not end well was. */
function attempt(outcome: OperationOutcome): string {
    const project = projectDisplayName(outcome.projectPath);
    const id = outcome.packageId ?? '';
    switch (outcome.kind) {
        case 'install':
            return `Install of ${id} in ${project}`;
        case 'update':
            return `Update of ${id} in ${project}`;
        case 'remove':
            return `Uninstall of ${id} from ${project}`;
        default:
            return `Restore of ${project}`;
    }
}

/**
 * What a bulk operation did with how many of its items, by its kind. An update or uninstall whose edits span more than one
 * project names how many (UX-P4.fix-21): the count stays the edits, the number its confirmation asked about.
 */
function bulkSentence(kind: OperationKind, packageId: string | undefined, done: number, total: number, projects: number): string {
    const count = done === total ? `${total}` : `${done} of ${total}`;
    switch (kind) {
        case 'install':
            return `Installed ${packageId ?? ''} in ${count} ${total === 1 && done === total ? 'project' : 'projects'}`;
        case 'update':
            if (projects > 1) {
                return `Updated ${count} packages in ${projects} projects`;
            }
            return `Updated ${count} ${total === 1 && done === total ? 'package' : 'packages'}`;
        case 'remove':
            if (projects > 1) {
                return `Uninstalled ${count} packages from ${projects} projects`;
            }
            return `Uninstalled ${count} ${total === 1 && done === total ? 'package' : 'packages'}`;
        default:
            return `Restored ${count} ${total === 1 && done === total ? 'project' : 'projects'}`;
    }
}

const RUNNING: Record<Exclude<OperationKind, 'restore'>, string> = { install: 'Installing', update: 'Updating', remove: 'Uninstalling' };

/** What runs, from its last report: the one package, or "packages" for several or a bulk (UX-P4.7, DO 7). */
function runningText(report: OperationProgress | undefined): string {
    if (report?.kind === undefined) {
        return 'operation running';
    }
    if (report.kind === 'restore') {
        return 'Restoring projects';
    }
    const ids = report.packageIds ?? [];
    const several = report.total !== undefined || ids.length !== 1 || (report.projectPaths?.length ?? 0) > 1;
    // A record read at the head of a concatenation, so the microcopy lint spells out each verb (UX-P3.11b).
    if (several) {
        return RUNNING[report.kind] + ' packages';
    }
    return RUNNING[report.kind] + ' ' + ids[0];
}

/**
 * The text of the queue's status bar item (UX-P4.7, DO 7): what runs, from the running operation's last report, and how many
 * wait; `undefined` when nothing does, and the item hides.
 */
export function queueStatusText(counts: { active: number; pending: number }, running: OperationProgress | undefined): string | undefined {
    if (counts.active + counts.pending === 0) {
        return undefined;
    }
    if (counts.pending > 0) {
        return `$(sync~spin) ${PREFIX}${runningText(running)}, ${counts.pending} queued`;
    }
    return `$(sync~spin) ${PREFIX}${runningText(running)}`;
}

export interface QueueStatusDeps {
    statusBar: Pick<vscode.StatusBarItem, 'text' | 'show' | 'hide'>;
    onDidChange: Event<{ active: number; pending: number }>;
    onProgress: Event<OperationProgress>;
    onCompleted: Event<OperationOutcome | BulkOutcome>;
}

/**
 * The queue's status bar item (UX-P4.7, DO 7; architecture-advisor rulings of 2026-11-18): what runs, from the running
 * operation's last report kept by its opId until its outcome or an idle queue, never cleared on a mere change (the queue starts
 * the next job and it reports before the change and the old outcome fire), and how many wait.
 */
export function registerQueueStatus(deps: QueueStatusDeps): vscode.Disposable {
    let counts = { active: 0, pending: 0 };
    let running: OperationProgress | undefined;
    const show = (): void => {
        const line = queueStatusText(counts, running);
        if (line === undefined) {
            deps.statusBar.hide();
            return;
        }
        deps.statusBar.text = line;
        deps.statusBar.show();
    };
    const subscriptions = [
        deps.onDidChange(next => {
            counts = next;
            if (next.active + next.pending === 0) {
                running = undefined;
            }
            show();
        }),
        deps.onProgress(report => {
            // A later report of the same operation keeps what an earlier one said and it does not (a restore step names no package).
            running = running?.opId === report.opId
                ? { ...running, ...report, kind: report.kind ?? running.kind, packageIds: report.packageIds ?? running.packageIds, projectPaths: report.projectPaths ?? running.projectPaths }
                : report;
            show();
        }),
        deps.onCompleted(outcome => {
            if (running?.opId === outcome.opId) {
                running = undefined;
                show();
            }
        }),
    ];
    return new vscode.Disposable(() => subscriptions.forEach(subscription => subscription.dispose()));
}

export function registerOperationFeedback(deps: OperationFeedbackDeps): vscode.Disposable {
    const open = new Map<string, OpenNotification>();
    // The tickets the host submitted itself, until their outcome (architecture-advisor ruling of 2026-11-18, DO 2).
    const hostSubmitted = new Set<string>();

    const warn = (text: string): void => {
        void vscode.window.showWarningMessage(PREFIX + text, SHOW_OUTPUT).then(choice => {
            if (choice === SHOW_OUTPUT) {
                deps.output.show(true);
            }
        });
    };
    const inform = (text: string): void => {
        void vscode.window.showInformationMessage(PREFIX + text);
    };

    const onHostSubmitted = deps.onHostSubmitted(report => {
        if (report.status === 'queued') {
            hostSubmitted.add(report.opId);
        }
    });

    const onProgress = deps.onProgress(report => {
        if (report.total === undefined) {
            return;
        }
        const detail = report.detail ?? '';
        const message = report.status === 'restoring'
            ? `Restoring ${report.current ?? 0} of ${report.total}: ${detail}`
            : `${report.current ?? 0} of ${report.total}: ${detail}`;
        const known = open.get(report.opId);
        if (known !== undefined) {
            if (known.progress !== undefined) {
                known.progress.report({ message });
            } else {
                known.last = { message };
            }
            return;
        }
        const entry: OpenNotification = { last: { message }, finished: false };
        open.set(report.opId, entry);
        void vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: TITLES[report.kind ?? 'restore'], cancellable: false },
            progress => new Promise<void>(resolve => {
                entry.progress = progress;
                entry.resolve = resolve;
                if (entry.last !== undefined) {
                    progress.report(entry.last);
                    entry.last = undefined;
                }
                if (entry.finished) {
                    resolve();
                }
            }),
        );
    });

    const onCompleted = deps.onCompleted(outcome => {
        const entry = open.get(outcome.opId);
        if (entry !== undefined) {
            entry.finished = true;
            entry.resolve?.();
            open.delete(outcome.opId);
        }
        const fromHost = hostSubmitted.delete(outcome.opId);
        if (outcome.status === 'cancelled') {
            return;
        }
        if (outcome.status === 'failed') {
            deps.output.show(true);
        }
        if ('results' in outcome) {
            if (outcome.status === 'rejected') {
                warn(`The operation was not started: ${bare(outcome.message ?? 'the queue is full')}.`);
                return;
            }
            const [first] = outcome.results;
            if (first === undefined) {
                // No result, no kind to name: as the live region says it (UX-P4.fix-21); a completed one did nothing and says nothing.
                if (outcome.status !== 'completed') {
                    const reason = outcome.message;
                    if (reason === undefined || bare(reason) === '') {
                        warn('The operation failed.');
                    } else {
                        warn(`The operation failed: ${bare(reason)}.`);
                    }
                }
                return;
            }
            const total = outcome.results.length;
            const done = outcome.results.filter(result => result.status === 'completed').length;
            const failedEdits = total - done;
            const failedRestores = outcome.restores.filter(restore => !restore.ok && !restore.skipped).length;
            const { kind, packageId } = first;
            // The scope the user confirmed: every result's project, as sent (the live region counts the same way).
            const projects = new Set(outcome.results.map(result => result.projectPath)).size;
            if (outcome.status === 'completed') {
                inform(`${bulkSentence(kind, packageId, total, total, projects)}.`);
            } else if (total === 1 && done === 0 && kind === 'restore') {
                // One project's failed restore reads as the panel says it, never "0 of 1" (UX-P4.fix-20); an empty reason is absent.
                const reason = [outcome.restores[0]?.error, first.message, outcome.message].find(text => text !== undefined && bare(text) !== '');
                if (reason === undefined) {
                    warn(`${attempt(first)} failed.`);
                } else {
                    warn(`${attempt(first)} failed: ${bare(reason)}.`);
                }
            } else {
                const edits = failedEdits > 0 ? `; ${failedEdits} failed` : '';
                // A restore's results are its projects' restores: counted once, by the results (UX-P4.fix-16).
                const restores = failedRestores > 0 && kind !== 'restore' ? `; ${plural(failedRestores, 'restore')} failed` : '';
                warn(`${bulkSentence(kind, packageId, done, total, projects)}${edits}${restores}.`);
            }
            return;
        }
        switch (outcome.status) {
            case 'completed':
                // D50: no toast. The surface that asked says it, the row menu's surface by the outcome's origin (UX-P4.fix-11);
                // the host says only what it started with no surface to say it.
                if (fromHost && outcome.origin === undefined) {
                    vscode.window.setStatusBarMessage(`${PREFIX}${doneSentence(outcome)}.`, 5000);
                }
                return;
            case 'partial':
                warn(`${doneSentence(outcome)}, but the restore failed: ${bare(outcome.restore?.error ?? outcome.message ?? 'unknown error')}.`);
                return;
            case 'failed':
                warn(`${attempt(outcome)} failed: ${bare(outcome.message ?? outcome.edit?.error ?? 'unknown error')}.`);
                return;
            case 'rejected':
                warn(`${attempt(outcome)} was not started: ${bare(outcome.message ?? 'the queue is full')}.`);
                return;
            default:
        }
    });

    return new vscode.Disposable(() => {
        onHostSubmitted.dispose();
        onProgress.dispose();
        onCompleted.dispose();
        for (const entry of open.values()) {
            entry.finished = true;
            entry.resolve?.();
        }
        open.clear();
    });
}
