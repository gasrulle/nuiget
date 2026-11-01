import { describe, expect, it } from 'vitest';
import type { InstalledPackage } from '../../../protocol';
import { UNRESOLVED_HINT, updateRowContext, versionCell } from './rules';

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
