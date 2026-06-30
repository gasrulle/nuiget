import { describe, expect, it } from 'vitest';
import {
    aggregateAllProjectsTransitive,
    selectErroredTransitiveProjects,
    type ProjectTransitiveSlot,
} from './aggregateAllProjectsTransitive';
import type { TransitivePackage } from '../types';

function pkg(overrides: Partial<TransitivePackage> & { id: string; version: string }): TransitivePackage {
    return {
        requiredByChain: [],
        ...overrides,
    };
}

function slot(overrides: Partial<ProjectTransitiveSlot> & { projectName: string }): ProjectTransitiveSlot {
    return {
        frameworks: [],
        dataSourceAvailable: true,
        received: true,
        ...overrides,
    };
}

describe('aggregateAllProjectsTransitive', () => {
    it('returns empty array for empty input', () => {
        expect(aggregateAllProjectsTransitive({})).toEqual([]);
    });

    it('skips slots with dataSourceAvailable=false (restore candidates)', () => {
        const rows = aggregateAllProjectsTransitive({
            '/a.csproj': slot({
                projectName: 'A',
                dataSourceAvailable: false,
                frameworks: [{ targetFramework: 'net8.0', packages: [pkg({ id: 'X', version: '1.0' })] }],
            }),
        });
        expect(rows).toEqual([]);
    });

    it('dedupes packages across projects by `(lowerId, normalizedVersion)`', () => {
        const rows = aggregateAllProjectsTransitive({
            '/a.csproj': slot({
                projectName: 'A',
                frameworks: [{ targetFramework: 'net8.0', packages: [pkg({ id: 'Newtonsoft.Json', version: '13.0.1' })] }],
            }),
            '/b.csproj': slot({
                projectName: 'B',
                frameworks: [{ targetFramework: 'net8.0', packages: [pkg({ id: 'newtonsoft.json', version: '13.0.1' })] }],
            }),
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe('Newtonsoft.Json'); // first-seen casing wins
        expect(rows[0].origins.map(o => o.projectPath).sort()).toEqual(['/a.csproj', '/b.csproj']);
    });

    it('treats versions case-insensitively and trims whitespace', () => {
        const rows = aggregateAllProjectsTransitive({
            '/a.csproj': slot({
                projectName: 'A',
                frameworks: [{ targetFramework: 'net8.0', packages: [pkg({ id: 'X', version: '1.0.0-Preview' })] }],
            }),
            '/b.csproj': slot({
                projectName: 'B',
                frameworks: [{ targetFramework: 'net8.0', packages: [pkg({ id: 'X', version: ' 1.0.0-preview ' })] }],
            }),
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].versionNormalized).toBe('1.0.0-preview');
        expect(rows[0].origins).toHaveLength(2);
    });

    it('keeps different versions as separate rows', () => {
        const rows = aggregateAllProjectsTransitive({
            '/a.csproj': slot({
                projectName: 'A',
                frameworks: [{ targetFramework: 'net8.0', packages: [pkg({ id: 'X', version: '1.0.0' }), pkg({ id: 'X', version: '2.0.0' })] }],
            }),
        });
        expect(rows).toHaveLength(2);
        expect(rows.map(r => r.version).sort()).toEqual(['1.0.0', '2.0.0']);
    });

    it('merges frameworks within a single origin when chainHash matches', () => {
        const rows = aggregateAllProjectsTransitive({
            '/a.csproj': slot({
                projectName: 'A',
                frameworks: [
                    { targetFramework: 'net8.0', packages: [pkg({ id: 'X', version: '1.0', requiredByChain: ['Top'] })] },
                    { targetFramework: 'net9.0', packages: [pkg({ id: 'X', version: '1.0', requiredByChain: ['Top'] })] },
                ],
            }),
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].origins).toHaveLength(1);
        expect(rows[0].origins[0].frameworks).toEqual(['net8.0', 'net9.0']);
        expect(rows[0].frameworks).toEqual(['net8.0', 'net9.0']);
    });

    it('splits origins per `(projectPath, chainHash)` when same project requires via different chains', () => {
        const rows = aggregateAllProjectsTransitive({
            '/a.csproj': slot({
                projectName: 'A',
                frameworks: [
                    { targetFramework: 'net8.0', packages: [pkg({ id: 'X', version: '1.0', requiredByChain: ['Foo'] })] },
                    { targetFramework: 'net9.0', packages: [pkg({ id: 'X', version: '1.0', requiredByChain: ['Bar'] })] },
                ],
            }),
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].origins).toHaveLength(2);
        expect(rows[0].origins.map(o => o.requiredByChain.join('→')).sort()).toEqual(['Bar', 'Foo']);
    });

    it('keeps origins separate when truncated requiredByChain matches but fullChain differs (>5 roots)', () => {
        const rows = aggregateAllProjectsTransitive({
            '/a.csproj': slot({
                projectName: 'A',
                frameworks: [
                    { targetFramework: 'net8.0', packages: [pkg({ id: 'X', version: '1.0', requiredByChain: ['D1', 'D2', 'D3', 'D4', 'D5'], fullChain: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'] })] },
                    { targetFramework: 'net9.0', packages: [pkg({ id: 'X', version: '1.0', requiredByChain: ['D1', 'D2', 'D3', 'D4', 'D5'], fullChain: ['D1', 'D2', 'D3', 'D4', 'D5', 'D7'] })] },
                ],
            }),
        });
        // The two origins share the first 5 (truncated) roots but differ at root 6 — the dedup
        // key uses the full root set, so they must NOT collapse into one origin.
        expect(rows).toHaveLength(1);
        expect(rows[0].origins).toHaveLength(2);
    });

    it('back-fills metadata (iconUrl/verified/authors) from later occurrences', () => {
        const rows = aggregateAllProjectsTransitive({
            '/a.csproj': slot({
                projectName: 'A',
                frameworks: [{ targetFramework: 'net8.0', packages: [pkg({ id: 'X', version: '1.0' })] }],
            }),
            '/b.csproj': slot({
                projectName: 'B',
                frameworks: [{ targetFramework: 'net8.0', packages: [pkg({ id: 'X', version: '1.0', iconUrl: 'http://icon', verified: true, authors: 'me' })] }],
            }),
        });
        expect(rows[0].iconUrl).toBe('http://icon');
        expect(rows[0].verified).toBe(true);
        expect(rows[0].authors).toBe('me');
    });

    it('does not overwrite metadata once set', () => {
        const rows = aggregateAllProjectsTransitive({
            '/a.csproj': slot({
                projectName: 'A',
                frameworks: [{ targetFramework: 'net8.0', packages: [pkg({ id: 'X', version: '1.0', iconUrl: 'http://first', verified: true })] }],
            }),
            '/b.csproj': slot({
                projectName: 'B',
                frameworks: [{ targetFramework: 'net8.0', packages: [pkg({ id: 'X', version: '1.0', iconUrl: 'http://second', verified: false })] }],
            }),
        });
        expect(rows[0].iconUrl).toBe('http://first');
        expect(rows[0].verified).toBe(true);
    });

    it('sorts rows alphabetically by id (case-insensitive)', () => {
        const rows = aggregateAllProjectsTransitive({
            '/a.csproj': slot({
                projectName: 'A',
                frameworks: [{
                    targetFramework: 'net8.0',
                    packages: [pkg({ id: 'Zeta', version: '1.0' }), pkg({ id: 'alpha', version: '1.0' }), pkg({ id: 'Beta', version: '1.0' })],
                }],
            }),
        });
        expect(rows.map(r => r.id)).toEqual(['alpha', 'Beta', 'Zeta']);
    });

    it('preserves `workspaceFolder` on origins', () => {
        const rows = aggregateAllProjectsTransitive({
            '/a.csproj': slot({
                projectName: 'A',
                workspaceFolder: 'repo1',
                frameworks: [{ targetFramework: 'net8.0', packages: [pkg({ id: 'X', version: '1.0' })] }],
            }),
        });
        expect(rows[0].origins[0].workspaceFolder).toBe('repo1');
    });
});

describe('selectErroredTransitiveProjects', () => {
    it('ignores in-flight slots (received=false placeholders)', () => {
        const out = selectErroredTransitiveProjects({
            '/a.csproj': slot({ projectName: 'A', received: false, dataSourceAvailable: false }),
            '/b.csproj': slot({ projectName: 'B', received: false, errorKind: 'parse-failed' }),
        });
        expect(out).toEqual([]);
    });

    it('flags missing assets (dataSourceAvailable=false)', () => {
        const out = selectErroredTransitiveProjects({
            '/a.csproj': slot({ projectName: 'A', received: true, dataSourceAvailable: false }),
        });
        expect(out).toEqual([{ projectPath: '/a.csproj', projectName: 'A', missing: true }]);
    });

    it('flags errorKind on received slots with available data source', () => {
        const out = selectErroredTransitiveProjects({
            '/a.csproj': slot({ projectName: 'A', received: true, errorKind: 'parse-failed' }),
            '/b.csproj': slot({ projectName: 'B', received: true, errorKind: 'fs-error' }),
            '/c.csproj': slot({ projectName: 'C', received: true }), // no error → not in output
        });
        expect(out).toEqual([
            { projectPath: '/a.csproj', projectName: 'A', errorKind: 'parse-failed' },
            { projectPath: '/b.csproj', projectName: 'B', errorKind: 'fs-error' },
        ]);
    });

    it('prefers `missing` over `errorKind` when dataSourceAvailable=false (assets.json absent supersedes)', () => {
        const out = selectErroredTransitiveProjects({
            '/a.csproj': slot({ projectName: 'A', received: true, dataSourceAvailable: false, errorKind: 'parse-failed' }),
        });
        expect(out).toEqual([{ projectPath: '/a.csproj', projectName: 'A', missing: true }]);
    });
});
