import type { BulkOutcome, OperationKind, OperationOutcome } from '../../protocol';

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
 * One sentence for the live region about how an operation ended, on whichever surface it started. The words
 * are those of the interface (Install, Update, Uninstall, Restore), not of the protocol (`remove`).
 */
export function describeOutcome(outcome: AnyOutcome): string {
    if ('results' in outcome) {
        const done = outcome.results.filter(result => result.status === 'completed').length;
        const total = outcome.results.length;
        if (outcome.status === 'rejected') {
            return `The operation was not started${because(outcome.message)}`;
        }
        return outcome.status === 'completed' ? `${total} of ${total} operations completed` : `${done} of ${total} operations completed${because(outcome.message)}`;
    }
    const what = subject(outcome);
    switch (outcome.status) {
        case 'completed':
            return `${DONE[outcome.kind]} ${what}`;
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
