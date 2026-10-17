/**
 * What VS Code shows about an operation (P9.9, D17): a progress notification while a bulk operation runs, a toast when
 * any operation ends, and the output channel when one fails. `settleOperation` announces each ticket once, whichever
 * surface started it, so this one subscriber shows one toast per outcome with both surfaces open. A bulk operation is
 * the one whose progress reports carry `total`; a single operation and a rejected ticket open no notification.
 */

import * as vscode from 'vscode';
import type { Event } from '../core/contracts';
import type { BulkOutcome, OperationKind, OperationOutcome, OperationProgress } from '../protocol';
import { projectDisplayName } from './services';

export interface OperationFeedbackDeps {
    onProgress: Event<OperationProgress>;
    onCompleted: Event<OperationOutcome | BulkOutcome>;
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
            return `Uninstall of ${id} in ${project}`;
        default:
            return `Restore of ${project}`;
    }
}

/** What a bulk operation did with how many of its items, by its kind. */
function bulkSentence(kind: OperationKind, packageId: string | undefined, done: number, total: number): string {
    const count = done === total ? `${total}` : `${done} of ${total}`;
    switch (kind) {
        case 'install':
            return `Installed ${packageId ?? ''} in ${count} ${total === 1 && done === total ? 'project' : 'projects'}`;
        case 'update':
            return `Updated ${count} ${total === 1 && done === total ? 'package' : 'packages'}`;
        case 'remove':
            return `Uninstalled ${count} ${total === 1 && done === total ? 'package' : 'packages'}`;
        default:
            return `Restored ${count} ${total === 1 && done === total ? 'project' : 'projects'}`;
    }
}

export function registerOperationFeedback(deps: OperationFeedbackDeps): vscode.Disposable {
    const open = new Map<string, OpenNotification>();

    const warn = (text: string): void => {
        void vscode.window.showWarningMessage(PREFIX + text, 'Show output').then(choice => {
            if (choice === 'Show output') {
                deps.output.show(true);
            }
        });
    };
    const inform = (text: string): void => {
        void vscode.window.showInformationMessage(PREFIX + text);
    };

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
        if (outcome.status === 'cancelled') {
            return;
        }
        if (outcome.status === 'failed') {
            deps.output.show(true);
        }
        if ('results' in outcome) {
            const total = outcome.results.length;
            const done = outcome.results.filter(result => result.status === 'completed').length;
            const failedEdits = total - done;
            const failedRestores = outcome.restores.filter(restore => !restore.ok && !restore.skipped).length;
            const kind = outcome.results[0]?.kind ?? 'restore';
            const packageId = outcome.results[0]?.packageId;
            if (outcome.status === 'rejected') {
                warn(`The operation was not started: ${outcome.message ?? 'the queue is full'}`);
            } else if (outcome.status === 'completed') {
                inform(`${bulkSentence(kind, packageId, total, total)}.`);
            } else {
                const edits = failedEdits > 0 ? `; ${failedEdits} failed` : '';
                const restores = failedRestores > 0 ? `; ${plural(failedRestores, 'restore')} failed` : '';
                warn(`${bulkSentence(kind, packageId, done, total)}${edits}${restores}.`);
            }
            return;
        }
        switch (outcome.status) {
            case 'completed':
                inform(doneSentence(outcome));
                return;
            case 'partial':
                warn(`${doneSentence(outcome)}, but the restore failed: ${outcome.restore?.error ?? outcome.message ?? 'unknown error'}`);
                return;
            case 'failed':
                warn(`${attempt(outcome)} failed: ${outcome.message ?? outcome.edit?.error ?? 'unknown error'}`);
                return;
            case 'rejected':
                warn(`${attempt(outcome)} was not started: ${outcome.message ?? 'the queue is full'}`);
                return;
            default:
        }
    });

    return new vscode.Disposable(() => {
        onProgress.dispose();
        onCompleted.dispose();
        for (const entry of open.values()) {
            entry.finished = true;
            entry.resolve?.();
        }
        open.clear();
    });
}
