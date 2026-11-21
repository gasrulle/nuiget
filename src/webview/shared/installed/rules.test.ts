import { describe, expect, it } from 'vitest';
import type { InstalledPackage, InstalledResult, OperationProgress, PackageSearchResult, PackageUpdate } from '../../../protocol';
import type { Settling } from '../store/ops';
import { UNRESOLVED_HINT, browseRowContext, busyEntry, busyText, directVulnerability, filterById, groupCount, projectNameOf, transitiveVulnerability, updateCandidates, updateRowContext, updatesInOrder, versionCell, vulnerabilityOf, vulnerabilitySeverity, whyNotDeletable } from './rules';

const entry = (changes: Partial<InstalledPackage>): InstalledPackage => ({ id: 'Lib', version: '1.2.3', versionType: 'standard', declaration: 'project', ...changes });

describe('versionCell', () => {
    it('shows a pattern with the version it resolves to, a wildcard as always latest, and a plain version as declared', () => {
        expect(versionCell(entry({ version: '10.*', versionType: 'floating', resolvedVersion: '10.2.0' }))).toEqual({ text: '10.* (10.2.0)', title: 'Floating version pattern' });
        expect(versionCell(entry({ version: '10.*', versionType: 'floating' }))).toEqual({ text: '10.* (run restore)', title: 'Floating version pattern' });
        expect(versionCell(entry({ version: '*', versionType: 'floating', isAlwaysLatest: true, resolvedVersion: '13.0.1' }))).toEqual({ text: '* (always latest: 13.0.1)', title: 'Always the latest version' });
        expect(versionCell(entry({ version: '[1,2)', versionType: 'range', resolvedVersion: '1.5.0' }))).toEqual({ text: '[1,2) (1.5.0)', title: 'Version range' });
        expect(versionCell(entry({ version: '', versionType: 'unresolved', declaration: 'unresolved' }))).toEqual({ text: 'unresolved', title: UNRESOLVED_HINT });
        expect(versionCell(entry({}))).toEqual({ text: '1.2.3' });
    });
});

describe('updateRowContext', () => {
    const update = { id: 'Moq', installedVersion: '1.0.0', latestVersion: '2.0.0', sourceUrl: 'https://feed' };
    const result = (changes = {}) => ({ projectPath: '/p', fidelity: 'authoritative', isCpm: false, packages: [], ...changes }) as never;

    it('carries the section, the versions and the row facts', () => {
        expect(updateRowContext(update as never, '/p', entry({ id: 'Moq', versionType: 'floating', declaration: 'central' }), result())).toEqual({
            webviewSection: 'updateRow', packageId: 'Moq', projectPath: '/p', installedVersion: '1.0.0', latestVersion: '2.0.0', versionType: 'floating', sourceUrl: 'https://feed',
            'nuiget.floating': true, 'nuiget.central': true, 'nuiget.readOnly': false,
        });
    });

    it('a row of an unsupported project is read-only', () => {
        expect(updateRowContext(update as never, '/p', entry({ id: 'Moq' }), result({ unsupported: { reason: 'sdk-too-old', message: 'x' } }))['nuiget.readOnly']).toBe(true);
    });
});

describe('updateCandidates', () => {
    const row = (id: string): PackageUpdate => ({ id, installedVersion: '1.0.0', latestVersion: '2.0.0', sourceUrl: 'https://feed' });
    const installed = (packages: InstalledPackage[], changes: Partial<InstalledResult> = {}): InstalledResult => ({ projectPath: '/p', fidelity: 'authoritative', isCpm: true, packages, ...changes });
    const idle = (): boolean => false;

    it('takes nothing before the installed list is known', () => {
        expect(updateCandidates([row('Lib')], undefined, idle)).toEqual([]);
    });

    it('leaves out an unresolved row, a central row and a row with no installed entry; an override row joins', () => {
        const result = installed([
            entry({ id: 'Lib' }),
            entry({ id: 'Broken', version: '', versionType: 'unresolved', declaration: 'unresolved' }),
            entry({ id: 'Central', declaration: 'central' }),
            entry({ id: 'Override', declaration: 'central-override' }),
        ]);
        expect(updateCandidates([row('Lib'), row('Broken'), row('Central'), row('Override'), row('Gone')], result, idle).map(update => update.id)).toEqual(['Lib', 'Override']);
    });

    it('takes nothing from an unsupported project', () => {
        const result = installed([entry({ id: 'Lib' })], { unsupported: { reason: 'sdk-too-old', message: 'requires .NET SDK 10 or newer' } });
        expect(updateCandidates([row('Lib')], result, idle)).toEqual([]);
    });

    it('leaves out a busy row, matches ids whatever the case and keeps the order it is given', () => {
        const result = installed([entry({ id: 'alpha' }), entry({ id: 'Beta' }), entry({ id: 'Gamma' })]);
        expect(updateCandidates([row('Gamma'), row('Alpha'), row('Beta')], result, id => id === 'Beta').map(update => update.id)).toEqual(['Gamma', 'Alpha']);
    });
});

/** The part of the ops slice `busyText` reads: the active operations and, where given, the settling packages by key. */
const ops = (active: ReadonlyMap<string, OperationProgress>, settling: readonly Settling[] = []) => ({ active, settling: new Map(settling.map(entry => [`${entry.projectPath}|${entry.packageId.toLowerCase()}`, entry])) });

describe('busyText (UX-P3.12b)', () => {
    const progress = (changes: Partial<OperationProgress>): OperationProgress => ({ opId: 'op', status: 'running', kind: 'update', projectPaths: ['/w/App.csproj'], packageIds: ['Serilog'], ...changes });
    it('names the kind of the operation on that project and package, whatever the id\'s case', () => {
        expect(busyText(ops(new Map([['a', progress({})]])), '/w/App.csproj', 'serilog')).toBe('Updating');
        expect(busyText(ops(new Map([['a', progress({ kind: 'remove' })]])), '/w/App.csproj', 'SERILOG')).toBe('Uninstalling');
    });
    it('names an install and a restore by their own words, the two DS-STATE-6\'s measurement cell leaves to these tests (UX-P4.fix-22)', () => {
        expect(busyText(ops(new Map([['a', progress({ kind: 'install' })]])), '/w/App.csproj', 'Serilog')).toBe('Installing');
        expect(busyText(ops(new Map([['a', progress({ kind: 'restore' })]])), '/w/App.csproj', 'Serilog')).toBe('Restoring');
        // A restore step of an install keeps the install's word: the kind names the operation, the status only its step.
        expect(busyText(ops(new Map([['a', progress({ kind: 'install', status: 'restoring' })]])), '/w/App.csproj', 'Serilog')).toBe('Installing');
    });
    it('says it is in progress for another project, another package or an operation without a kind yet', () => {
        expect(busyText(ops(new Map([['a', progress({})]])), '/w/Other.csproj', 'Serilog')).toBe('In progress');
        expect(busyText(ops(new Map([['a', progress({})]])), '/w/App.csproj', 'Moq')).toBe('In progress');
        expect(busyText(ops(new Map([['a', progress({ kind: undefined })]])), '/w/App.csproj', 'Serilog')).toBe('In progress');
        expect(busyText(ops(new Map()), '/w/App.csproj', 'Serilog')).toBe('In progress');
    });
    describe('reads Queued only while another operation runs (UX-P4.7, X77)', () => {
        const other = (changes: Partial<OperationProgress>): OperationProgress => progress({ opId: 'other', packageIds: ['Moq'], ...changes });
        it('a queued entry alone reads the word of its kind, the surface\'s own unnamed entry and a host one alike', () => {
            expect(busyText(ops(new Map([['local:1', progress({ opId: 'local:1', status: 'queued' })]])), '/w/App.csproj', 'Serilog')).toBe('Updating');
            expect(busyText(ops(new Map([['op', progress({ status: 'queued' })]])), '/w/App.csproj', 'Serilog')).toBe('Updating');
        });
        it('a queued entry beside another that runs or restores reads Queued', () => {
            expect(busyText(ops(new Map([['op', progress({ status: 'queued' })], ['other', other({ status: 'running' })]])), '/w/App.csproj', 'Serilog')).toBe('Queued');
            expect(busyText(ops(new Map([['op', progress({ status: 'queued' })], ['other', other({ status: 'restoring' })]])), '/w/App.csproj', 'Serilog')).toBe('Queued');
        });
        it('two queued entries with nothing running both read the word of their kind', () => {
            const active = new Map([['op', progress({ status: 'queued' })], ['other', other({ status: 'queued', kind: 'remove' })]]);
            expect(busyText(ops(active), '/w/App.csproj', 'Serilog')).toBe('Updating');
            expect(busyText(ops(active), '/w/App.csproj', 'Moq')).toBe('Uninstalling');
        });
        it('a running entry beside a queued one reads the word of its kind', () => {
            expect(busyText(ops(new Map([['op', progress({ status: 'running' })], ['other', other({ status: 'queued' })]])), '/w/App.csproj', 'Serilog')).toBe('Updating');
        });
    });
});

describe('busyText reads Finishing while a package settles (X31, UX-P4.8c)', () => {
    const progress = (changes: Partial<OperationProgress>): OperationProgress => ({ opId: 'op', status: 'running', kind: 'update', projectPaths: ['/w/App.csproj'], packageIds: ['Serilog'], ...changes });
    const settling = (kind: Settling['kind'], packageId = 'Serilog'): Settling => ({ kind, projectPath: '/w/App.csproj', packageId });
    it('busyText reads Finishing for a settling package', () => {
        expect(busyText(ops(new Map(), [settling('install')]), '/w/App.csproj', 'serilog')).toBe('Finishing');
        expect(busyText(ops(new Map(), [settling('update')]), '/w/App.csproj', 'Serilog')).toBe('Finishing');
        expect(busyText(ops(new Map(), [settling('remove')]), '/w/App.csproj', 'SERILOG')).toBe('Finishing');
        // Another project's package of the same id does not settle here.
        expect(busyText(ops(new Map(), [settling('update')]), '/w/Other.csproj', 'Serilog')).toBe('In progress');
    });
    it('an active operation\'s word wins over Finishing', () => {
        expect(busyText(ops(new Map([['op', progress({ kind: 'remove' })]]), [settling('update')]), '/w/App.csproj', 'Serilog')).toBe('Uninstalling');
        expect(busyText(ops(new Map([['op', progress({ status: 'queued' })]]), [settling('install')]), '/w/App.csproj', 'Serilog')).toBe('Updating');
    });
    it('a settling package makes no other row Queued', () => {
        const queued = progress({ opId: 'other', status: 'queued', packageIds: ['Moq'] });
        expect(busyText(ops(new Map([['other', queued]]), [settling('update')]), '/w/App.csproj', 'Moq')).toBe('Updating');
    });
    it('busyEntry answers the settling entry with its kind when no operation is active', () => {
        expect(busyEntry(ops(new Map(), [settling('remove')]), '/w/App.csproj', 'serilog')?.kind).toBe('remove');
        expect(busyEntry(ops(new Map([['op', progress({ kind: 'update' })]]), [settling('remove')]), '/w/App.csproj', 'Serilog')?.kind).toBe('update');
        expect(busyEntry(ops(new Map()), '/w/App.csproj', 'Serilog')).toBeUndefined();
    });
});

describe('updatesInOrder (X76, UX-P4.8b)', () => {
    const rows = [{ id: 'Serilog' }, { id: 'Moq' }, { id: 'Serilog.Sinks.Console' }];
    it('keeps the arrival order while the first check streams, filtered', () => {
        expect(updatesInOrder(rows, '', true).map(row => row.id)).toEqual(['Serilog', 'Moq', 'Serilog.Sinks.Console']);
        expect(updatesInOrder(rows, ' seri ', true).map(row => row.id)).toEqual(['Serilog', 'Serilog.Sinks.Console']);
    });
    it('lists the rows by id from the answer on, as filterById does', () => {
        expect(updatesInOrder(rows, '', false).map(row => row.id)).toEqual(['Moq', 'Serilog', 'Serilog.Sinks.Console']);
        expect(updatesInOrder(rows, 'seri', false)).toEqual(filterById(rows, 'seri'));
    });
});

describe('filterById (UX-P3.12b)', () => {
    it('keeps the rows whose id holds the trimmed filter in any case, sorted by id, and leaves its input alone', () => {
        const rows = [{ id: 'Serilog.Sinks.Console' }, { id: 'Moq' }, { id: 'Serilog' }, { id: 'xunit' }];
        const before = rows.map(row => row.id);
        expect(filterById(rows, '  SERI ').map(row => row.id)).toEqual(['Serilog', 'Serilog.Sinks.Console']);
        expect(filterById(rows, '').map(row => row.id)).toEqual(['Moq', 'Serilog', 'Serilog.Sinks.Console', 'xunit']);
        expect(rows.map(row => row.id)).toEqual(before);
        expect(filterById(rows, '')).not.toBe(rows);
    });
});

describe('browseRowContext (UX-P4.1)', () => {
    const found: PackageSearchResult = { id: 'Polly', version: '8.4.2', description: '', authors: '', versions: ['8.4.2'], sourceUrl: 'https://feed/' };

    it('is writable unless the caller says the project cannot remove its entry', () => {
        expect(browseRowContext(found, '/w/App.csproj', undefined)).toMatchObject({ 'nuiget.installed': false, 'nuiget.readOnly': false });
        expect(browseRowContext(found, '/w/App.csproj', '8.0.0')).toMatchObject({ installedVersion: '8.0.0', 'nuiget.installed': true, 'nuiget.readOnly': false });
        expect(browseRowContext(found, '/w/App.csproj', '8.0.0', true)).toMatchObject({ 'nuiget.installed': true, 'nuiget.readOnly': true });
    });
});

describe('whyNotDeletable (UX-P4.2a)', () => {
    const result = (changes: Partial<InstalledResult> = {}): InstalledResult => ({ projectPath: '/p/App.csproj', fidelity: 'authoritative', isCpm: false, packages: [], ...changes });
    const entry = (changes: Partial<InstalledPackage> = {}): InstalledPackage => ({ id: 'Serilog', version: '3.0.0', versionType: 'standard', declaration: 'project', ...changes });

    it('reads the installed entry with whyNotRemovable', () => {
        expect(whyNotDeletable('Serilog', entry(), result())).toBeUndefined();
        expect(whyNotDeletable('Serilog', entry({ declaration: 'props' }), result())).toBe('Serilog is declared in an imported props file and cannot be uninstalled from the project');
    });

    it('without an entry says an unsupported project\'s reason, and nothing for a supported one', () => {
        expect(whyNotDeletable('Serilog', undefined, result({ unsupported: { reason: 'sdk-too-old', message: 'requires .NET SDK 10 or newer' } }))).toBe('Serilog cannot be uninstalled: requires .NET SDK 10 or newer');
        expect(whyNotDeletable('Serilog', undefined, result())).toBeUndefined();
        expect(whyNotDeletable('Serilog', undefined, undefined)).toBeUndefined();
    });
});

describe('projectNameOf (UX-P4.2a)', () => {
    it('takes the listed name, else the file name without its extension, on either separator', () => {
        expect(projectNameOf([{ name: 'Gateway', path: '/w/Gateway/Gateway.csproj' }], '/w/Gateway/Gateway.csproj')).toBe('Gateway');
        expect(projectNameOf(undefined, '/w/Lib/Lib.csproj')).toBe('Lib');
        expect(projectNameOf([], 'C:\\w\\Tools\\Tools.fsproj')).toBe('Tools');
    });
});

describe('vulnerability knowledge (UX-P5.1a)', () => {
    const advisory = [{ severity: 'High' as const, advisoryUrl: 'https://github.com/advisories/x' }];

    it('is vulnerable with an advisory, clear with an empty list, and unknown without an entry or without the field', () => {
        expect(vulnerabilityOf({ id: 'A', version: '1.0.0', vulnerabilities: advisory })).toBe('vulnerable');
        expect(vulnerabilityOf({ id: 'A', version: '1.0.0', vulnerabilities: [] })).toBe('clear');
        expect(vulnerabilityOf({ id: 'A', version: '1.0.0' })).toBe('unknown');
        expect(vulnerabilityOf(undefined)).toBe('unknown');
        expect(directVulnerability(new Map([['serilog', { id: 'Serilog', version: '3.0.0', vulnerabilities: advisory }]]), 'Serilog')).toBe('vulnerable');
    });

    it('counts a transitive package under two frameworks twice, and an unusable or missing list as unknown', () => {
        const frameworks = ['net8.0', 'net10.0'].map(targetFramework => ({ targetFramework, packages: [{ id: 'X', version: '1.0.0', requiredByChain: ['A'] }, { id: 'Y', version: '2.0.0', requiredByChain: ['A'] }] }));
        const result = { projectPath: '/p.csproj', dataSourceAvailable: true, frameworks };
        const metadata = new Map([['x@1.0.0', { id: 'X', version: '1.0.0', vulnerabilities: advisory }], ['y@2.0.0', { id: 'Y', version: '2.0.0', vulnerabilities: [] }]]);
        expect(transitiveVulnerability(result, metadata)).toEqual({ vulnerable: 2, unknown: false });
        expect(transitiveVulnerability(result, new Map([['x@1.0.0', { id: 'X', version: '1.0.0', vulnerabilities: advisory }]]))).toEqual({ vulnerable: 2, unknown: true });
        expect(transitiveVulnerability({ ...result, dataSourceAvailable: false }, metadata)).toEqual({ vulnerable: 0, unknown: true });
        expect(transitiveVulnerability({ ...result, errorKind: 'fs-error' }, metadata)).toEqual({ vulnerable: 0, unknown: true });
        expect(transitiveVulnerability(undefined, metadata)).toEqual({ vulnerable: 0, unknown: true });
    });
});

describe('groupCount (UX-P5.1a design follow-up 4)', () => {
    it('reads k of N while the id filter is on, and under @vulnerable only once the view has settled, whatever is unknown', () => {
        expect(groupCount(3, 3, false, false, false)).toBe(3);
        expect(groupCount(3, 1, true, false, false)).toBe('1 of 3');
        // Under @vulnerable the settle decides, not the id filter.
        expect(groupCount(3, 0, true, true, false)).toBe(3);
        expect(groupCount(3, 0, false, true, true)).toBe('0 of 3');
        expect(groupCount(68, 1, false, true, true)).toBe('1 of 68');
    });
});

describe('vulnerabilitySeverity (UX-P5.1b)', () => {
    const advisory = (severity: 'Low' | 'Moderate' | 'High' | 'Critical') => ({ severity, advisoryUrl: `https://github.com/advisories/${severity}` });
    it('is nothing unless vulnerable, else the highest severity, the count and its problems level', () => {
        expect(vulnerabilitySeverity(undefined)).toBeUndefined();
        expect(vulnerabilitySeverity({ id: 'A', version: '1.0.0' })).toBeUndefined();
        expect(vulnerabilitySeverity({ id: 'A', version: '1.0.0', vulnerabilities: [] })).toBeUndefined();
        expect(vulnerabilitySeverity({ id: 'A', version: '1.0.0', vulnerabilities: [advisory('Low')] })).toEqual({ highest: 'Low', count: 1, level: 'info' });
        expect(vulnerabilitySeverity({ id: 'A', version: '1.0.0', vulnerabilities: [advisory('Moderate'), advisory('Low')] })).toEqual({ highest: 'Moderate', count: 2, level: 'warning' });
        expect(vulnerabilitySeverity({ id: 'A', version: '1.0.0', vulnerabilities: [advisory('High')] })).toEqual({ highest: 'High', count: 1, level: 'error' });
        expect(vulnerabilitySeverity({ id: 'A', version: '1.0.0', vulnerabilities: [advisory('Low'), advisory('Critical'), advisory('High')] })).toEqual({ highest: 'Critical', count: 3, level: 'error' });
    });
});
