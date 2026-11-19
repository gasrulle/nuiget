import type { BulkOutcome, OperationKind, OperationOutcome } from '../../../protocol';

type AnyOutcome = OperationOutcome | BulkOutcome;

const DONE: Record<OperationKind, string> = { install: 'Installed', update: 'Updated', remove: 'Uninstalled', restore: 'Restored' };
const NOUN: Record<OperationKind, string> = { install: 'Install', update: 'Update', remove: 'Uninstall', restore: 'Restore' };

const projectName = (projectPath: string): string => projectPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? projectPath;

/** What the operation was about: the package, or the project for a restore. */
function subject(outcome: OperationOutcome): string {
    if (outcome.packageId === undefined) {
        return projectName(outcome.projectPath);
    }
    return outcome.kind === 'remove' || outcome.version === undefined ? outcome.packageId : `${outcome.packageId} ${outcome.version}`;
}

const because = (message: string | undefined): string => (message ? `: ${message}` : '');

/**
 * A restore's bulk outcome (one `restores` entry per project, `results` of kind `restore` only): the project by name, or
 * the projects counted (design-advisor ruling of UX-P4.fix-10).
 */
function describeRestore(outcome: BulkOutcome): string {
    const total = outcome.restores.length;
    const done = outcome.restores.filter(restore => restore.ok).length;
    const what = total === 1 ? projectName(outcome.restores[0].projectPath) : `${total} projects`;
    switch (outcome.status) {
        case 'completed':
            return `${DONE.restore} ${what}`;
        case 'cancelled':
            return `${NOUN.restore} of ${what} was cancelled`;
        default:
            return total === 1 ? `${NOUN.restore} of ${what} failed${because(outcome.restores[0].error ?? outcome.message)}` : `${DONE.restore} ${done} of ${total} projects`;
    }
}

/**
 * An edit bulk (install, update or uninstall) of several results, in the toast's words (`src/host/feedback.ts`,
 * `bulkSentence`): the package and its projects counted for an install, the packages counted otherwise, "n of m" when not
 * every one was done, and the restores that failed after the edits (design-advisor ruling of UX-P4.fix-17).
 */
function describeBulkEdits(outcome: BulkOutcome): string {
    const total = outcome.results.length;
    const done = outcome.results.filter(result => result.status === 'completed').length;
    const { kind, packageId } = outcome.results[0];
    const what = (count: number | string): string => (kind === 'install' ? `${packageId ?? ''} in ${count} projects` : `${count} packages`);
    if (outcome.status === 'completed') {
        return `${DONE[kind]} ${what(total)}`;
    }
    if (outcome.status === 'cancelled') {
        return `${NOUN[kind]} of ${what(total)} was cancelled`;
    }
    const failedRestores = outcome.restores.filter(restore => !restore.ok && !restore.skipped).length;
    const restores = failedRestores === 0 ? '' : `; ${failedRestores} ${failedRestores === 1 ? 'restore' : 'restores'} failed`;
    return `${DONE[kind]} ${what(done === total ? total : `${done} of ${total}`)}${restores}`;
}

/**
 * Lifted from `src/webview/sidebar/outcomes.ts` (P5.4), which re-exports it: both surfaces announce outcomes in the
 * same words. A restore's bulk outcome reads in the words of a single operation (UX-P4.fix-10); an edit bulk of one reads
 * as its single operation, and of several names its kind and its package or count in the toast's words (UX-P4.fix-17).
 *
 * One sentence for the live region about how an operation ended, on whichever surface it started. The words
 * are those of the interface (Install, Update, Uninstall, Restore), not of the protocol (`remove`).
 */
export function describeOutcome(outcome: AnyOutcome): string {
    if ('results' in outcome) {
        if (outcome.status === 'rejected') {
            return `The operation was not started${because(outcome.message)}`;
        }
        if (outcome.restores.length > 0 && outcome.results.every(result => result.kind === 'restore')) {
            return describeRestore(outcome);
        }
        if (outcome.results.length === 0) {
            if (outcome.status === 'cancelled') {
                return 'The operation was cancelled';
            }
            return outcome.status === 'failed' ? `The operation failed${because(outcome.message)}` : 'No operation ran';
        }
        if (outcome.results.length === 1) {
            const failedRestore = outcome.restores.find(restore => !restore.ok && !restore.skipped);
            return describeSingle({ ...outcome.results[0], status: outcome.status, restore: failedRestore ?? outcome.results[0].restore });
        }
        return describeBulkEdits(outcome);
    }
    return describeSingle(outcome);
}

/** A single operation's sentence: the package (or project) and how it ended. */
function describeSingle(outcome: OperationOutcome): string {
    const what = subject(outcome);
    // A central change also restored the other projects that use the central entry (ADR-004 tier 3).
    const others = outcome.affectedProjects?.length ?? 0;
    const also = others === 0 ? '' : `; also restored ${others} other ${others === 1 ? 'project' : 'projects'}`;
    switch (outcome.status) {
        case 'completed':
            return `${DONE[outcome.kind]} ${what}${also}`;
        case 'partial':
            // The edit was made; what failed is the restore after it.
            return `${DONE[outcome.kind]} ${what}, but the restore failed${because(outcome.restore?.error ?? outcome.message)}`;
        case 'cancelled':
            return `${NOUN[outcome.kind]} of ${what} was cancelled`;
        case 'rejected':
            return `${NOUN[outcome.kind]} of ${what} was not started${because(outcome.message)}`;
        default:
            return `${NOUN[outcome.kind]} of ${what} failed${because(outcome.message)}`;
    }
}
