import { describe, expect, it } from 'vitest';
import { COLLECT_LAYOUT, elementGroups, formatLine, type Layout, measureLines, RAMP, RULES, type Scope, stateGroup, TOLERANCES } from '../ui/v2/measure';
import { STATES } from '../ui/v2/states';

/**
 * UX-P0.10: the measurement registry of `src/test/ui/v2/measure.ts`. The rules run only in the UI job (inside VS Code);
 * this test holds their statuses, the line format and the verdicts on hand-built layouts on every push.
 */
const layout = (overrides: Partial<Layout> = {}): Layout => ({
    root: true, examined: 0, offRamp: [], offRampCount: 0, blockGaps: [], sections: [], toolbars: [], mainHeader: undefined,
    sidebarHeader: undefined, mainLefts: {}, mainRegionLeft: undefined, details: undefined, sidebar: undefined, ...overrides,
});

const at16 = { title: 16, search: 16, tab: 16, toolbar: 16, section: 16, row: 16 };

const asGrid1 = { 'main-updates': { pending: 'P3.1b' }, browse: { pending: 'P3.2' }, details: { pending: 'P3.3b' }, dialogs: { pending: 'P3.5' }, sources: { pending: 'P3.6' }, sidebar: { pending: 'P3.7a' } };

/** A state of each group, by its name (no sources state is named yet; `stateGroup` files one by its prefix). */
const STATE_OF: Record<string, string> = {
    'main-installed': 'main-installed-single', 'main-updates': 'main-updates', browse: 'main-browse-results', details: 'main-installed-details',
    dialogs: 'main-installed-bulk-dialog', sources: 'main-sources-list', sidebar: 'sidebar-sections',
};

describe('the measurement rules (UX-P0.10)', () => {
    it('writes D34\'s tolerances and the ramp once', () => {
        expect(TOLERANCES).toEqual({ coincide: 1, gapMembership: 0.5, proximity: 2 });
        expect(RAMP).toEqual([0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40]);
    });

    it('keeps PF-6 hard and every other rule of this item pending on its Appendix B item', () => {
        expect(RULES.map(rule => rule.id)).toEqual(['PF-6', 'DS-GRID-1', 'DS-GRID-2a', 'DS-GRID-2b', 'DS-INSET-1', 'DS-INSET-2']);
        const scopes = (id: string): unknown => RULES.find(rule => rule.id === id)?.scopes;
        expect(scopes('PF-6')).toEqual({ 'main-installed': 'hard' });
        expect(scopes('DS-GRID-1')).toEqual({ 'main-installed': { pending: 'P2.7' }, ...asGrid1 });
        expect(scopes('DS-GRID-2a')).toEqual({ 'main-installed': { pending: 'P2.7' }, ...asGrid1 });
        expect(scopes('DS-GRID-2b')).toEqual({ 'main-installed': { pending: 'P2.6' }, ...asGrid1 });
        expect(scopes('DS-INSET-1')).toEqual({ 'main-installed': { pending: 'P2.7' }, details: { pending: 'P3.3b' }, sidebar: { pending: 'P3.7a' } });
        expect(scopes('DS-INSET-2')).toEqual({ toolbars: { pending: 'P2.5' }, headers: { pending: 'P2.6' }, 'main-header': { pending: 'P2.7' }, sidebar: { pending: 'P3.7a' } });
        // Each rule's tolerance is one of D34's.
        expect(Object.fromEntries(RULES.map(rule => [rule.id, rule.tolerance]))).toEqual({
            'PF-6': 1, 'DS-GRID-1': 0.5, 'DS-GRID-2a': 0.5, 'DS-GRID-2b': 2, 'DS-INSET-1': 1, 'DS-INSET-2': 1,
        });
    });

    it('prints one format for hard and pending lines', () => {
        expect(formatLine({ name: 'PF-6@main-installed-single', value: 'spread 0', status: 'hard', pass: true })).toBe('[measure] PF-6@main-installed-single: spread 0 (hard)');
        expect(formatLine({ name: 'DS-INSET-2@main-installed-single/toolbars', value: '16/6 4/4', status: { pending: 'P2.5' }, pass: false }))
            .toBe('[measure] DS-INSET-2@main-installed-single/toolbars: 16/6 4/4 (pending P2.5)');
    });

    it('puts every named state into a state group', () => {
        const groups = Object.fromEntries(STATES.map(state => [state.name, stateGroup(state.name)]));
        expect(groups['main-installed-single']).toBe('main-installed');
        expect(groups['main-transitive-expanded']).toBe('main-installed');
        expect(groups['main-updates']).toBe('main-updates');
        expect(groups['main-browse-results']).toBe('browse');
        expect(groups['main-quicksearch-open']).toBe('browse');
        expect(groups['main-installed-details']).toBe('details');
        expect(groups['main-details-readme']).toBe('details');
        expect(groups['main-installed-bulk-dialog']).toBe('dialogs');
        expect(groups['sidebar-update-all-dialog']).toBe('dialogs');
        expect(groups['sidebar-sections']).toBe('sidebar');
        expect(stateGroup('main-sources-list')).toBe('sources');
    });

    it('never stays silent: every scope with a status prints not measurable on an empty layout, and so does a missing root', () => {
        for (const rule of RULES) {
            for (const scope of Object.keys(rule.scopes) as Scope[]) {
                const group = scope in STATE_OF ? scope : (['main-installed', 'main-updates', 'details', 'browse'] as const).find(state => elementGroups(state).includes(scope as never));
                const state = rule.states?.[0] ?? STATE_OF[group as string];
                const name = scope === group ? `${rule.id}@${state}` : `${rule.id}@${state}/${scope}`;
                const line = measureLines(state, layout(), 'modern').find(candidate => candidate.name === name);
                expect(line, name).toMatchObject({ pass: false, value: expect.stringMatching(/^not measurable/) });
            }
        }
        const lines = measureLines('main-installed-single', layout({ root: false, mainLefts: at16, examined: 10 }), 'modern');
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.every(line => !line.pass && line.value === 'not measurable (no root)')).toBe(true);
    });

    it('passes PF-6 when every left edge is within 1 px of the title\'s, as P9.fix-6 did, never passing an absent element', () => {
        const pf6 = (lefts: Record<string, number | undefined>) => measureLines('main-installed-single', layout({ mainLefts: lefts, mainRegionLeft: 0 }), 'modern').find(line => line.name === 'PF-6@main-installed-single');
        expect(pf6(at16)).toMatchObject({ pass: true, status: 'hard' });
        // A 2 px spread with every edge within 1 px of the title passed P9.fix-6, and passes here.
        expect(pf6({ ...at16, tab: 17, row: 15 })).toMatchObject({ pass: true, value: expect.stringMatching(/^spread 2 /) });
        expect(pf6({ ...at16, tab: 18 })).toMatchObject({ pass: false });
        expect(pf6({ ...at16, row: undefined })).toMatchObject({ pass: false, value: 'not measurable (row)' });
        // Only main-installed-single carries PF-6.
        expect(measureLines('main-installed-cpm', layout({ mainLefts: at16 }), 'modern').some(line => line.name.startsWith('PF-6'))).toBe(false);
    });

    it('reports content insets as start/end top/bottom and holds DS-INSET-2 to the values the rule sets (V2)', () => {
        const toolbar = (insets: { start: number; end: number; top: number; bottom: number }) => measureLines('main-installed-single', layout({ toolbars: [{ id: 'installed-toolbar', insets }] }), 'modern')
            .find(line => line.name === 'DS-INSET-2@main-installed-single/toolbars');
        expect(toolbar({ start: 16, end: 6, top: 4, bottom: 4 })).toMatchObject({ value: '16/6 4/4', pass: false, status: { pending: 'P2.5' } });
        expect(toolbar({ start: 16, end: 16, top: 4, bottom: 4 })).toMatchObject({ pass: true });
        // Symmetric is not enough: the toolbar's start and end are the main panel's 16.
        expect(toolbar({ start: 6, end: 6, top: 4, bottom: 4 })).toMatchObject({ pass: false });
        const sidebar = (look: 'modern' | 'classic') => measureLines('sidebar-sections', layout({ sidebarHeader: { start: 8, end: 8, top: 8, bottom: 8 } }), look)
            .find(line => line.name === 'DS-INSET-2@sidebar-sections');
        expect(sidebar('modern')).toMatchObject({ pass: true, status: { pending: 'P3.7a' } });
        expect(sidebar('classic')).toMatchObject({ pass: false });
    });

    it('checks block gaps against {4, 8}, spacing against the ramp and header proximity', () => {
        const lines = measureLines('main-installed-single', layout({
            examined: 40, blockGaps: [4, 8, 7], offRamp: ['.nuiget-tab-bar padding-left 7px'], offRampCount: 1,
            sections: [{ id: 'direct', variant: 'group', insets: undefined, above: 4, below: 12 }],
        }), 'modern');
        expect(lines.find(line => line.name === 'DS-GRID-2a@main-installed-single')).toMatchObject({ value: 'gaps 4, 7, 8 (1 off {4, 8})', pass: false });
        expect(lines.find(line => line.name === 'DS-GRID-1@main-installed-single')).toMatchObject({ value: '1 off-ramp (.nuiget-tab-bar padding-left 7px)', pass: false });
        expect(lines.find(line => line.name === 'DS-GRID-2b@main-installed-single')).toMatchObject({ value: 'direct 4/12', pass: false });
        const close = measureLines('main-installed-single', layout({ sections: [{ id: 'direct', variant: 'group', insets: undefined, above: 4, below: 6 }] }), 'modern');
        expect(close.find(line => line.name === 'DS-GRID-2b@main-installed-single')).toMatchObject({ pass: true });
    });

    it('measures the sidebar\'s insets against its look', () => {
        const sidebar = { rootLeft: 0, titles: [28], names: [28], search: 8 };
        const modern = measureLines('sidebar-sections', layout({ sidebar }), 'modern').find(line => line.name === 'DS-INSET-1@sidebar-sections');
        const classic = measureLines('sidebar-sections', layout({ sidebar }), 'classic').find(line => line.name === 'DS-INSET-1@sidebar-sections');
        expect(modern).toMatchObject({ pass: true, status: { pending: 'P3.7a' } });
        expect(classic).toMatchObject({ pass: false });
    });

    it('ships an in-page collector that parses as a script body', () => {
        expect(() => new Function(COLLECT_LAYOUT)).not.toThrow();
    });
});
