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

    it('counts the operations of a bulk outcome', () => {
        const bulk = (changes: Partial<BulkOutcome>): BulkOutcome => ({
            opId: 'bulk', status: 'completed', restores: [],
            results: [single({ opId: 'a' }), single({ opId: 'b', packageId: 'Moq' })],
            ...changes,
        });
        expect(describeOutcome(bulk({}))).toBe('2 of 2 operations completed');
        expect(describeOutcome(bulk({ status: 'partial', results: [single({}), single({ status: 'failed' })], message: 'Moq: NU1101' }))).toBe('1 of 2 operations completed: Moq: NU1101');
        expect(describeOutcome(bulk({ status: 'failed', results: [single({ status: 'failed' })] }))).toBe('0 of 1 operations completed');
        expect(describeOutcome(bulk({ status: 'rejected', results: [], message: 'Five operations are waiting' }))).toBe('The operation was not started: Five operations are waiting');
    });
});
