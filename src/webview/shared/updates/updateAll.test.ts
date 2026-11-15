import { describe, expect, it } from 'vitest';
import type { ProjectUpdatesChunk } from '../../../protocol';
import { failure } from './sentence';
import { allProjectsKnowledge, bulkUpdateButton, noCandidateWhy, singleKnowledge } from './updateAll';

describe('the Update All rule (MU6; UX-P3.11, design-advisor opening ruling DO 5)', () => {
    it('labels the primary by the seven rows of the table', () => {
        expect(bulkUpdateButton(2, 5, 'known')).toEqual({ label: 'Update Selected (2)', disabled: false, title: undefined });
        expect(bulkUpdateButton(2, 0, 'loading')).toEqual({ label: 'Update Selected (2)', disabled: false, title: undefined });
        expect(bulkUpdateButton(0, 5, 'known')).toEqual({ label: 'Update All (5)', disabled: false, title: undefined });
        expect(bulkUpdateButton(0, 0, 'known')).toEqual({ label: 'Update All (0)', disabled: true, title: 'No update in this list can join a bulk update.' });
        expect(bulkUpdateButton(0, 3, 'unavailable')).toEqual({ label: 'Update All', disabled: false, title: undefined });
        expect(bulkUpdateButton(0, 0, 'loading')).toEqual({ label: 'Update All', disabled: true, title: 'Updates are being checked.' });
        expect(bulkUpdateButton(0, 0, 'error')).toEqual({ label: 'Update All', disabled: true, title: 'The updates could not be checked.' });
        expect(bulkUpdateButton(0, 0, 'unavailable')).toEqual({ label: 'Update All', disabled: true, title: 'Some package sources could not be checked.' });
        expect(noCandidateWhy('known')).toBe('No update in this list can join a bulk update.');
    });

    it('knows one project\'s list once it is ready and every source was checked', () => {
        expect(singleKnowledge({ status: 'ready', sourcesUnavailable: false, error: undefined })).toBe('known');
        expect(singleKnowledge({ status: 'ready', sourcesUnavailable: true, error: undefined })).toBe('unavailable');
        expect(singleKnowledge({ status: 'loading', sourcesUnavailable: false, error: undefined })).toBe('loading');
        expect(singleKnowledge({ status: 'error', sourcesUnavailable: false, error: undefined })).toBe('error');
        // A failed revalidation keeps the ready list known (its rows are still the host's answer).
        expect(singleKnowledge({ status: 'ready', sourcesUnavailable: false, error: { code: 'failed', message: 'x' } as never })).toBe('known');
    });

    it('knows All Projects once every listed project answered without an error', () => {
        const projects = [{ name: 'App', path: '/a/App.csproj' }, { name: 'Lib', path: '/a/Lib.csproj' }] as never;
        const chunk = (path: string, error?: string): ProjectUpdatesChunk => ({ projectPath: path, projectName: path, updates: [], ...(error === undefined ? {} : { error }) } as ProjectUpdatesChunk);
        const all = (chunks: ProjectUpdatesChunk[], status: 'loading' | 'ready' | 'error' = 'ready', sourcesUnavailable = false) => ({ status, sourcesUnavailable, error: undefined, projects, chunks: new Map(chunks.map(entry => [entry.projectPath, entry])) });
        expect(allProjectsKnowledge(all([chunk('/a/App.csproj'), chunk('/a/Lib.csproj')]))).toBe('known');
        expect(allProjectsKnowledge(all([chunk('/a/App.csproj')]))).toBe('loading');
        expect(allProjectsKnowledge(all([chunk('/a/App.csproj'), chunk('/a/Lib.csproj', 'broken')]))).toBe('error');
        expect(allProjectsKnowledge(all([chunk('/a/App.csproj'), chunk('/a/Lib.csproj')], 'ready', true))).toBe('unavailable');
        expect(allProjectsKnowledge(all([], 'loading'))).toBe('loading');
        expect(allProjectsKnowledge({ ...all([chunk('/a/App.csproj'), chunk('/a/Lib.csproj')]), error: { code: 'failed', message: 'x' } as never })).toBe('known');
        expect(allProjectsKnowledge({ ...all([chunk('/a/App.csproj')], 'loading'), error: { code: 'failed', message: 'x' } as never })).toBe('error');
    });
});

describe('the failure form (Design System §10 item 8; UX-P3.11)', () => {
    it('keeps the host\'s reason as written and ends with one full stop', () => {
        expect(failure('The updates', 'checked', 'ECONNRESET')).toBe('The updates could not be checked: ECONNRESET.');
        expect(failure('The packages', 'searched', 'No package source could be reached for this package.')).toBe('The packages could not be searched: No package source could be reached for this package.');
        expect(failure('The details', 'loaded', '  http-error 503..  ')).toBe('The details could not be loaded: http-error 503.');
    });

    it('says the failure alone when there is no reason', () => {
        expect(failure('The projects', 'listed')).toBe('The projects could not be listed.');
        expect(failure('The projects', 'listed', '   ')).toBe('The projects could not be listed.');
    });
});
