import { describe, expect, it } from 'vitest';
import { groupOriginsByProject } from './groupOriginsByProject';
import type { AllProjectsTransitiveOrigin } from '../types';

function origin(overrides: Partial<AllProjectsTransitiveOrigin> & { projectPath: string; projectName: string }): AllProjectsTransitiveOrigin {
    return { frameworks: [], requiredByChain: [], chainHash: '', ...overrides };
}

describe('groupOriginsByProject', () => {
    it('returns empty array for no origins', () => {
        expect(groupOriginsByProject([])).toEqual([]);
    });

    it('collapses multiple origins of the same project into one group with unioned roots', () => {
        const groups = groupOriginsByProject([
            origin({ projectPath: '/a.csproj', projectName: 'A', frameworks: ['net8.0'], requiredByChain: ['Foo'] }),
            origin({ projectPath: '/a.csproj', projectName: 'A', frameworks: ['net9.0'], requiredByChain: ['Bar'] }),
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].roots).toEqual(['Bar', 'Foo']);
        expect(groups[0].frameworks).toEqual(['net8.0', 'net9.0']);
    });

    it('sorts groups by project name (case-insensitive)', () => {
        const groups = groupOriginsByProject([
            origin({ projectPath: '/z.csproj', projectName: 'zeta', requiredByChain: ['X'] }),
            origin({ projectPath: '/a.csproj', projectName: 'Alpha', requiredByChain: ['X'] }),
        ]);
        expect(groups.map(g => g.projectName)).toEqual(['Alpha', 'zeta']);
    });

    it('produces empty roots only when every origin of a project is empty', () => {
        const groups = groupOriginsByProject([
            origin({ projectPath: '/a.csproj', projectName: 'A', frameworks: ['net8.0'], requiredByChain: [] }),
        ]);
        expect(groups[0].roots).toEqual([]);
    });

    it('mixed empty + non-empty origins for one project → roots win (empty suppressed)', () => {
        const groups = groupOriginsByProject([
            origin({ projectPath: '/a.csproj', projectName: 'A', frameworks: ['net8.0'], requiredByChain: [] }),
            origin({ projectPath: '/a.csproj', projectName: 'A', frameworks: ['net9.0'], requiredByChain: ['Top'] }),
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].roots).toEqual(['Top']);
    });

    it('prefers fullChain over requiredByChain when present (>5 roots)', () => {
        const groups = groupOriginsByProject([
            origin({
                projectPath: '/a.csproj', projectName: 'A',
                requiredByChain: ['D1', 'D2', 'D3', 'D4', 'D5'],
                fullChain: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'],
            }),
        ]);
        expect(groups[0].roots).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6']);
    });

    it('keeps projects with the same display name but different paths separate', () => {
        const groups = groupOriginsByProject([
            origin({ projectPath: '/x/App.csproj', projectName: 'App', requiredByChain: ['Foo'] }),
            origin({ projectPath: '/y/App.csproj', projectName: 'App', requiredByChain: ['Bar'] }),
        ]);
        expect(groups).toHaveLength(2);
    });

    it('dedupes roots shared across a project\'s origins', () => {
        const groups = groupOriginsByProject([
            origin({ projectPath: '/a.csproj', projectName: 'A', requiredByChain: ['Shared', 'Foo'] }),
            origin({ projectPath: '/a.csproj', projectName: 'A', requiredByChain: ['Shared', 'Bar'] }),
        ]);
        expect(groups[0].roots).toEqual(['Bar', 'Foo', 'Shared']);
    });
});
