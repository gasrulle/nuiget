import { describe, expect, it } from 'vitest';
import type { BulkOutcome, OperationOutcome } from '../../protocol';
import { describeOutcome } from './outcomes';

const single = (changes: Partial<OperationOutcome>): OperationOutcome => ({ opId: 'op', kind: 'remove', status: 'completed', projectPath: '/w/App/App.csproj', packageId: 'Serilog', ...changes });

describe('describeOutcome', () => {
    it('names what was done in the words of the interface', () => {
        expect(describeOutcome(single({}))).toBe('Uninstalled Serilog');
        // An uninstall has no version to speak of, even when the outcome carries one.
        expect(describeOutcome(single({ version: '3.0.0' }))).toBe('Uninstalled Serilog');
        expect(describeOutcome(single({ kind: 'install', version: '3.0.0' }))).toBe('Installed Serilog 3.0.0');
        expect(describeOutcome(single({ kind: 'install' }))).toBe('Installed Serilog');
        expect(describeOutcome(single({ kind: 'update', version: '4.0.0' }))).toBe('Updated Serilog 4.0.0');
        // A restore is about a project.
        expect(describeOutcome(single({ kind: 'restore', packageId: undefined }))).toBe('Restored App');
        expect(describeOutcome(single({ kind: 'restore', packageId: undefined, projectPath: 'C:\\w\\Web\\Web.fsproj' }))).toBe('Restored Web');
    });

    it('says what went wrong, with the reason when there is one', () => {
        expect(describeOutcome(single({ status: 'failed', message: 'dotnet exited with 1' }))).toBe('Uninstall of Serilog failed: dotnet exited with 1');
        expect(describeOutcome(single({ status: 'failed' }))).toBe('Uninstall of Serilog failed');
        expect(describeOutcome(single({ status: 'rejected', message: 'Five operations are waiting' }))).toBe('Uninstall of Serilog was not started: Five operations are waiting');
        expect(describeOutcome(single({ status: 'cancelled' }))).toBe('Uninstall of Serilog was cancelled');
        expect(describeOutcome(single({ kind: 'install', version: '3.0.0', status: 'failed', message: 'NU1101' }))).toBe('Install of Serilog 3.0.0 failed: NU1101');
        expect(describeOutcome(single({ kind: 'update', version: '4.0.0', status: 'failed' }))).toBe('Update of Serilog 4.0.0 failed');
        expect(describeOutcome(single({ kind: 'restore', packageId: undefined, status: 'cancelled' }))).toBe('Restore of App was cancelled');
    });

    it('describeOutcome names the other projects a central change restored', () => {
        expect(describeOutcome(single({ kind: 'update', version: '4.1.0', affectedProjects: ['/w/Lib/Lib.csproj'] }))).toBe('Updated Serilog 4.1.0; also restored 1 other project');
        expect(describeOutcome(single({ kind: 'update', version: '4.1.0', affectedProjects: ['/w/Lib/Lib.csproj', '/w/Web/Web.csproj'] }))).toBe('Updated Serilog 4.1.0; also restored 2 other projects');
        expect(describeOutcome(single({ kind: 'update', version: '4.1.0', affectedProjects: [] }))).toBe('Updated Serilog 4.1.0');
    });

    it('a partial outcome says that the edit was made and the restore failed', () => {
        expect(describeOutcome(single({ status: 'partial', restore: { ok: false, error: 'NU1301' }, message: 'ignored' }))).toBe('Uninstalled Serilog, but the restore failed: NU1301');
        expect(describeOutcome(single({ status: 'partial', message: 'restore timed out' }))).toBe('Uninstalled Serilog, but the restore failed: restore timed out');
        expect(describeOutcome(single({ status: 'partial' }))).toBe('Uninstalled Serilog, but the restore failed');
    });

    it('a bulk outcome names its kind and its package or count, in the toast\'s words; across projects it names them (UX-P4.fix-17, UX-P4.fix-21)', () => {
        const bulk = (changes: Partial<BulkOutcome>): BulkOutcome => ({
            opId: 'bulk', status: 'completed', restores: [],
            results: [single({ opId: 'a' }), single({ opId: 'b', packageId: 'Moq' })],
            ...changes,
        });
        const two = (kind: OperationOutcome['kind'], second: Partial<OperationOutcome> = {}): OperationOutcome[] => [
            single({ opId: 'a', kind }),
            single({ opId: 'b', kind, packageId: kind === 'install' ? 'Serilog' : 'Moq', projectPath: '/w/Lib/Lib.csproj', ...second }),
        ];
        // Completed, of two: install names the package and counts its projects; update and uninstall count the packages.
        expect(describeOutcome(bulk({ results: two('install') }))).toBe('Installed Serilog in 2 projects');
        expect(describeOutcome(bulk({ results: two('update') }))).toBe('Updated 2 packages in 2 projects');
        expect(describeOutcome(bulk({}))).toBe('Uninstalled 2 packages');
        // Not every one done: "n of m"; the restores that failed after the edits are named (the toast's fixtures).
        expect(describeOutcome(bulk({ status: 'partial', results: two('update', { status: 'failed' }), restores: [{ projectPath: '/w/App/App.csproj', ok: false, error: 'NU1101' }] }))).toBe('Updated 1 of 2 packages in 2 projects; 1 restore failed');
        expect(describeOutcome(bulk({ status: 'partial', results: two('update'), restores: [{ projectPath: '/w/App/App.csproj', ok: false }, { projectPath: '/w/Lib/Lib.csproj', ok: true, skipped: true }] }))).toBe('Updated 2 packages in 2 projects; 1 restore failed');
        expect(describeOutcome(bulk({ status: 'partial', results: two('install', { status: 'failed' }) }))).toBe('Installed Serilog in 1 of 2 projects');
        expect(describeOutcome(bulk({ status: 'failed', results: two('remove', { status: 'failed' }).map(result => ({ ...result, status: 'failed' as const })) }))).toBe('Uninstalled 0 of 2 packages from 2 projects');
        expect(describeOutcome(bulk({ status: 'partial', results: two('update', { status: 'failed' }), restores: [{ projectPath: '/w/App/App.csproj', ok: false }, { projectPath: '/w/Lib/Lib.csproj', ok: false }] }))).toBe('Updated 1 of 2 packages in 2 projects; 2 restores failed');
        // Cancelled, of two.
        expect(describeOutcome(bulk({ status: 'cancelled', results: two('install') }))).toBe('Install of Serilog in 2 projects was cancelled');
        expect(describeOutcome(bulk({ status: 'cancelled', results: two('update') }))).toBe('Update of 2 packages in 2 projects was cancelled');
        expect(describeOutcome(bulk({ status: 'cancelled' }))).toBe('Uninstall of 2 packages was cancelled');
        // No result: no kind to name.
        expect(describeOutcome(bulk({ status: 'cancelled', results: [], message: 'cancelled' }))).toBe('The operation was cancelled');
        expect(describeOutcome(bulk({ status: 'failed', results: [], message: 'The queue is closed' }))).toBe('The operation failed: The queue is closed');
        expect(describeOutcome(bulk({ status: 'completed', results: [] }))).toBe('No operation ran');
        expect(describeOutcome(bulk({ status: 'rejected', results: [], message: 'Five operations are waiting' }))).toBe('The operation was not started: Five operations are waiting');
    });

    it('an update or uninstall in one project keeps its count alone; across projects the count is the edits (UX-P4.fix-21)', () => {
        const app = '/w/App/App.csproj';
        const lib = '/w/Lib/Lib.csproj';
        const bulk = (changes: Partial<BulkOutcome>): BulkOutcome => ({ opId: 'bulk', status: 'completed', restores: [], results: [], ...changes });
        // Two results of a kind, both in App: the one-project forms of UX-P4.fix-17.
        const inApp = (kind: OperationOutcome['kind'], second: Partial<OperationOutcome> = {}): OperationOutcome[] => [
            single({ opId: 'a', kind }),
            single({ opId: 'b', kind, packageId: 'Moq', ...second }),
        ];
        expect(describeOutcome(bulk({ results: inApp('update') }))).toBe('Updated 2 packages');
        expect(describeOutcome(bulk({ status: 'partial', results: inApp('update', { status: 'failed' }), restores: [{ projectPath: app, ok: false, error: 'NU1101' }] }))).toBe('Updated 1 of 2 packages; 1 restore failed');
        expect(describeOutcome(bulk({ status: 'partial', results: inApp('update'), restores: [{ projectPath: app, ok: false }] }))).toBe('Updated 2 packages; 1 restore failed');
        expect(describeOutcome(bulk({ status: 'failed', results: inApp('remove').map(result => ({ ...result, status: 'failed' as const })) }))).toBe('Uninstalled 0 of 2 packages');
        // The project count is read from the results, never from the restores.
        expect(describeOutcome(bulk({ status: 'partial', results: inApp('update', { status: 'failed' }), restores: [{ projectPath: app, ok: false }, { projectPath: lib, ok: false }] }))).toBe('Updated 1 of 2 packages; 2 restores failed');
        expect(describeOutcome(bulk({ status: 'cancelled', results: inApp('update') }))).toBe('Update of 2 packages was cancelled');
        // Three edits in two projects: the count is the edits, the projects follow.
        const three = (kind: OperationOutcome['kind'], third: Partial<OperationOutcome> = {}): OperationOutcome[] => [
            single({ opId: 'a', kind }),
            single({ opId: 'b', kind, packageId: 'Moq' }),
            single({ opId: 'c', kind, projectPath: lib, ...third }),
        ];
        expect(describeOutcome(bulk({ results: three('update') }))).toBe('Updated 3 packages in 2 projects');
        expect(describeOutcome(bulk({ results: three('remove') }))).toBe('Uninstalled 3 packages from 2 projects');
        expect(describeOutcome(bulk({ status: 'partial', results: three('update', { status: 'failed' }) }))).toBe('Updated 2 of 3 packages in 2 projects');
        expect(describeOutcome(bulk({ status: 'cancelled', results: [single({ opId: 'a', kind: 'remove' }), single({ opId: 'b', kind: 'remove', packageId: 'Moq', projectPath: lib })] }))).toBe('Uninstall of 2 packages from 2 projects was cancelled');
    });

    it('a bulk of one reads in the single operation\'s words (UX-P4.fix-17)', () => {
        const one = (changes: Partial<BulkOutcome>, result: Partial<OperationOutcome>): BulkOutcome => ({ opId: 'bulk', status: 'completed', restores: [], results: [single({ kind: 'update', version: '4.0.0', ...result })], ...changes });
        expect(describeOutcome(one({}, {}))).toBe('Updated Serilog 4.0.0');
        expect(describeOutcome(one({}, { kind: 'install', version: '3.1.0' }))).toBe('Installed Serilog 3.1.0');
        expect(describeOutcome(one({}, { kind: 'remove' }))).toBe('Uninstalled Serilog');
        expect(describeOutcome(one({ status: 'failed' }, { status: 'failed', message: 'NU1101' }))).toBe('Update of Serilog 4.0.0 failed: NU1101');
        expect(describeOutcome(one({ status: 'partial', restores: [{ projectPath: '/w/App/App.csproj', ok: false, error: 'NU1301' }] }, {}))).toBe('Updated Serilog 4.0.0, but the restore failed: NU1301');
        expect(describeOutcome(one({ status: 'cancelled' }, { status: 'cancelled' }))).toBe('Update of Serilog 4.0.0 was cancelled');
    });

    it('a restore\'s bulk outcome names the project or counts the projects (UX-P4.fix-10)', () => {
        const restore = (status: BulkOutcome['status'], steps: Array<{ projectPath: string; ok: boolean; error?: string; skipped?: boolean }>, withResults = true): BulkOutcome => ({
            opId: 'r', status,
            results: withResults ? steps.map(step => single({ opId: 'r', kind: 'restore', packageId: undefined, projectPath: step.projectPath, status: step.ok ? 'completed' : 'failed', restore: { ok: step.ok, error: step.error }, message: step.error })) : [],
            restores: steps.map(step => ({ projectPath: step.projectPath, ok: step.ok, error: step.error, skipped: step.skipped })),
        });
        const app = '/w/App/App.csproj';
        const lib = '/w/Lib/Lib.csproj';
        expect(describeOutcome(restore('completed', [{ projectPath: app, ok: true }]))).toBe('Restored App');
        expect(describeOutcome(restore('completed', [{ projectPath: app, ok: true }, { projectPath: lib, ok: true }]))).toBe('Restored 2 projects');
        expect(describeOutcome(restore('cancelled', [{ projectPath: app, ok: false, skipped: true, error: 'Cancelled' }], false))).toBe('Restore of App was cancelled');
        expect(describeOutcome(restore('cancelled', [{ projectPath: app, ok: true }, { projectPath: lib, ok: false, skipped: true }]))).toBe('Restore of 2 projects was cancelled');
        expect(describeOutcome(restore('failed', [{ projectPath: app, ok: false, error: 'NU1301' }]))).toBe('Restore of App failed: NU1301');
        expect(describeOutcome(restore('failed', [{ projectPath: app, ok: false }]))).toBe('Restore of App failed');
        expect(describeOutcome(restore('partial', [{ projectPath: app, ok: true }, { projectPath: lib, ok: false, error: 'NU1301' }]))).toBe('Restored 1 of 2 projects');
        expect(describeOutcome(restore('failed', [{ projectPath: app, ok: false }, { projectPath: lib, ok: false }]))).toBe('Restored 0 of 2 projects');
        // A bulk edit of one reads as a single operation (UX-P4.fix-17).
        expect(describeOutcome({ opId: 'b', status: 'completed', results: [single({ opId: 'a' })], restores: [{ projectPath: app, ok: true }] })).toBe('Uninstalled Serilog');
        expect(describeOutcome({ opId: 'b', status: 'partial', results: [single({ opId: 'a' })], restores: [{ projectPath: app, ok: false, error: 'NU1301' }] })).toBe('Uninstalled Serilog, but the restore failed: NU1301');
    });
});
