import { describe, expect, it } from 'vitest';
import { appliesTo, COLLECT_LAYOUT, elementGroups, formatLine, type Heights, type Layout, MEASURE_WIDGETS, measureLines, parseColour, RAMP, RULES, type Scope, type SpecElement, type SpecLook, stateGroup, thumbVerdict, TOLERANCES, WORKBENCH_WIDGETS } from '../ui/v2/measure';
import { STATES } from '../ui/v2/states';

/**
 * UX-P0.10 and UX-P0.11: the measurement registry of `src/test/ui/v2/measure.ts`. The rules run only in the UI job
 * (inside VS Code); this test holds their statuses, the line format and the verdicts on hand-built layouts on every push.
 */
const noHeights: Heights = {
    headers: [], compactRows: [], comfortableRows: [], comfortablePitches: [], tabStrip: undefined, detailsTabs: undefined, buttons: [], inputs: [],
    iconButtons: [], tabs: [], checkBoxes: [], checkSelect: { fill: '', border: '' }, badges: [], progress: [],
};

const layout = (overrides: Partial<Layout> = {}, heights: Partial<Heights> = {}): Layout => ({
    root: true, examined: 0, offRamp: [], offRampCount: 0, blockGaps: [], sections: [], toolbars: [], mainHeader: undefined,
    sidebarHeader: undefined, mainLefts: {}, mainRegionLeft: undefined, details: undefined, sidebar: undefined,
    centring: [], detailsButtons: { uninstall: undefined, update: undefined }, width: 1200, rows: [], chrome: {}, firstRow: undefined,
    overflow: { containers: 0, collisions: [], outside: [], clipped: [], count: 0, badges: [] }, transitiveGap: undefined, primaryEdges: [],
    browsing: false, documentOverflow: undefined,
    endOfP0: {
        rows: [], listSelection: { active: 'rgb(4, 57, 94)', inactive: 'rgb(55, 55, 61)' }, buttonSecondary: { hover: '', rest: '' }, iconColours: { icon: 'rgb(204, 204, 204)', active: 'rgb(255, 255, 255)', disabled: 'rgb(90, 90, 90)', warning: 'rgb(204, 167, 0)', hoverBg: 'rgba(90, 93, 94, 0.31)' }, tabColours: { active: 'rgb(231, 231, 231)', inactive: 'rgb(157, 157, 157)', indicator: 'rgb(0, 120, 212)' }, actionRadius: '4px', listPaneWidth: undefined, detailsHeader: undefined, sideways: [], controlsOut: [], minContent: { toolbar: undefined, header: undefined },
        factLefts: [], fonts: { root: '', others: [] }, textStyles: [], verifiedMarks: [], verifiedForeground: '', dataLook: undefined, lookTokens: {}, rootLineHeight: undefined, compactLineHeights: [], metaText: [], descriptionForeground: '', copyEnds: [],
        focus: undefined, focusColours: { focusBorder: '', listFocusOutline: '', contrastActiveBorder: '' }, disabled: [],
    },
    testIds: {},
    scrollbar: { rootColor: '', slider: '', scrollers: [] },
    ...overrides, heights: { ...noHeights, ...heights },
});

/** An icon button's facts as the collector reports them: 22 px, in `icon`, in no band. */
const iconButton = (overrides: Partial<Heights['iconButtons'][number]> = {}): Heights['iconButtons'][number] => ({
    inHeader: false, width: 22, height: 22, hit: { width: 24, height: 24 }, label: 'refresh-button', glyph: { w: 16, h: 16 }, colour: 'rgb(204, 204, 204)', background: 'rgba(0, 0, 0, 0)',
    radius: '4px', disabled: false, hovered: false, band: undefined, listFocused: false, multi: false, severity: false, ...overrides,
});

const lineOf = (state: string, built: Layout, name: string, look: 'modern' | 'classic' = 'modern', workbench = {}) =>
    measureLines(state, built, look, workbench).find(line => line.name === name);

const at16 = { title: 16, search: 16, tab: 16, toolbar: 16, section: 16, row: 16 };

const asGrid1 = { 'main-updates': { pending: 'P3.1b' }, browse: { pending: 'P3.2' }, details: { pending: 'P3.3b' }, dialogs: { pending: 'P3.5' }, sources: { pending: 'P3.6' }, sidebar: { pending: 'P3.7a' } };

/** Every named state and a loading state of each group no item names yet (DS-HEIGHT-11's later scopes). */
const CANDIDATES = [...STATES.map(state => state.name), 'main-sources-list', 'main-updates-loading', 'main-browse-loading', 'main-loading-details', 'sidebar-loading'];

describe('the measurement rules (UX-P0.10, UX-P0.11)', () => {
    it('writes D34\'s tolerances and the ramp once', () => {
        expect(TOLERANCES).toEqual({ coincide: 1, gapMembership: 0.5, proximity: 2, height: 1, centring: 1, parity: 1, containment: 0, chrome: 0.5, fontExact: 0.1 });
        expect(RAMP).toEqual([0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40]);
    });

    it('keeps the PF rules and MS-8\'s chrome hard and every other rule pending on its Appendix B item', () => {
        expect(RULES.map(rule => rule.id)).toEqual([
            'PF-6', 'DS-GRID-1', 'DS-GRID-2a', 'DS-GRID-2b', 'DS-INSET-1', 'DS-INSET-2', 'PF-3b', 'PF-5',
            ...Array.from({ length: 11 }, (_, i) => `DS-HEIGHT-${i + 1}`),
            'PF-2', 'PF-3a', 'PF-4', 'MS-8', 'DS-OVERFLOW-6', 'DS-INSET-3', 'DS-OVERFLOW-2', 'DS-ROW-5',
            'DS-INSET-4', 'DS-ROW-1', 'DS-ROW-2', 'DS-ROW-3', 'DS-RADIUS-1', 'DS-COLOR-6', 'DS-ICON-2', 'DS-COLOR-4', 'DS-COLOR-7', 'DS-COLOR-3', 'DS-COLOR-2', 'DS-DIVIDER-1', 'DS-RADIUS-2', 'DS-COLOR-5', 'DS-ROW-6', 'DS-ICON-3', 'DS-DENSITY-1', 'DS-OVERFLOW-1', 'DS-OVERFLOW-3', 'DS-OVERFLOW-5', 'DS-ALIGN-1',
            'DS-TYPE-1', 'DS-TYPE-4', 'DS-TYPE-6', 'DS-ROW-4', 'DS-COPY-3', 'SPEC',
            'DS-FOCUS-1', 'DS-FOCUS-2', 'DS-FOCUS-3', 'DS-FOCUS-4', 'DS-STATE-7', 'DS-SCROLL-1',
            'DS-TYPE-2', 'DS-TYPE-3', 'DS-ICON-4', 'DS-LOOK-1',
        ]);
        const scopes = (id: string): unknown => RULES.find(rule => rule.id === id)?.scopes;
        expect(scopes('PF-6')).toEqual({ 'main-installed': 'hard' });
        expect(scopes('DS-COLOR-5')).toEqual({ rows: 'hard', tabs: 'hard', sash: { pending: 'P3.9' } });
        expect(scopes('DS-COLOR-4')).toEqual({ tabs: 'hard' });
        expect(scopes('DS-ICON-2')).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard', browse: 'hard', details: 'hard', sidebar: 'hard' });
        // UX-P2.2's flips hold only where their subject is, so a later edit cannot quietly shrink them.
        const definition = (id: string) => RULES.find(rule => rule.id === id);
        expect(definition('DS-ROW-1')?.widths).toEqual([800, 932, 1200, 1600]);
        for (const id of ['DS-HEIGHT-3', 'DS-ROW-1', 'DS-ROW-5', 'DS-ROW-6', 'DS-ICON-3', 'DS-DENSITY-1']) {
            expect(definition(id)?.exceptStates, id).toEqual(definition('DS-ROW-4')?.exceptStates);
        }
        expect(definition('DS-FOCUS-1')?.scopeStates).toEqual({ controls: ['main-browse-results', 'main-installed-filter', 'main-installed-filter-nomatch', 'main-installed-unfocused', 'main-quicksearch-open', 'main-quicksearch-versions'], tabs: ['main-installed-single', 'main-installed-all', 'main-installed-cpm', 'main-installed-hover', 'main-installed-toolbar-hover', 'main-installed-unsupported', 'main-updates', 'main-details-readme'] });
        expect(definition('DS-INSET-3')?.scopeStates).toEqual({ rows: ['main-installed-hover', 'main-installed-focus', 'main-installed-details'] });
        expect(definition('DS-ROW-3')?.scopeStates).toEqual({ 'main-installed': ['main-installed-hover', 'main-installed-focus', 'main-installed-unfocused'], details: ['main-installed-details', 'main-details-readme', 'main-transitive-details', 'main-browse-details'] });
        expect(definition('DS-FOCUS-2')?.states).toEqual(['main-installed-focus', 'main-installed-details', 'main-transitive-details', 'main-browse-details', 'main-transitive-expanded']);
        expect(definition('DS-FOCUS-2')?.pendingStates).toEqual({ 'main-transitive-expanded': 'P2.6' });
        expect(definition('DS-FOCUS-3')?.scopeStates).toEqual({ rows: ['main-installed-details'], tabs: ['main-updates'] });
        expect(definition('DS-FOCUS-4')?.states).toEqual(['main-installed-details', 'main-installed-focus']);
        expect(scopes('DS-GRID-1')).toEqual({ 'main-installed': { pending: 'P2.7' }, ...asGrid1 });
        expect(scopes('DS-GRID-2a')).toEqual({ 'main-installed': { pending: 'P2.7' }, ...asGrid1 });
        expect(scopes('DS-GRID-2b')).toEqual({ 'main-installed': { pending: 'P2.6' }, ...asGrid1 });
        expect(scopes('DS-INSET-1')).toEqual({ 'main-installed': { pending: 'P2.7' }, details: { pending: 'P3.3b' }, sidebar: { pending: 'P3.7a' } });
        expect(scopes('DS-INSET-2')).toEqual({ toolbars: 'hard', headers: { pending: 'P2.6' }, 'main-header': { pending: 'P2.7' }, sidebar: { pending: 'P3.7a' } });
        // UX-P0.11: PF-3b and PF-5 hard where P9.fix-3 and P9.fix-5 measured; the heights pending on Appendix B's items.
        const mainHard = () => ({ 'main-installed': 'hard', 'main-updates': 'hard', browse: 'hard', details: 'hard' });
        const main = (item: string) => ({ 'main-installed': { pending: item }, 'main-updates': { pending: item }, browse: { pending: item }, details: { pending: item } });
        expect(scopes('PF-3b')).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard' });
        expect(RULES.find(rule => rule.id === 'PF-3b')?.states).toEqual(['main-installed-single', 'main-updates']);
        expect(scopes('PF-5')).toEqual({ details: 'hard' });
        expect(RULES.find(rule => rule.id === 'PF-5')?.states).toEqual(['main-installed-details']);
        // The tracker's state group for DS-HEIGHT-1 and -2 is the sidebar.
        expect(scopes('DS-HEIGHT-1')).toEqual({ sidebar: { pending: 'P3.7a' } });
        expect(scopes('DS-HEIGHT-2')).toEqual({ sidebar: { pending: 'P3.7a' } });
        expect(scopes('DS-HEIGHT-3')).toEqual(mainHard());
        expect(scopes('DS-HEIGHT-4')).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard', details: 'hard' });
        expect(scopes('DS-HEIGHT-5')).toEqual({ details: { pending: 'P3.3b' } });
        expect(scopes('DS-HEIGHT-6')).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard', details: 'hard', dialogs: 'hard', sources: { pending: 'P3.6' } });
        expect(scopes('DS-HEIGHT-7')).toEqual({ ...mainHard(), sidebar: 'hard', dialogs: { pending: 'P3.6' }, sources: { pending: 'P3.6' } });
        expect(scopes('DS-HEIGHT-8')).toEqual({ ...mainHard(), sidebar: 'hard', sources: { pending: 'P3.6' } });
        expect(scopes('DS-HEIGHT-9')).toEqual({ ...mainHard(), dialogs: { pending: 'P3.5' }, sources: { pending: 'P3.6' } });
        expect(scopes('DS-RADIUS-1')).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard', details: 'hard', dialogs: 'hard', browse: 'hard', sidebar: 'hard', sources: { pending: 'P3.6' } });
        expect(scopes('DS-COLOR-6')).toEqual({ 'text-buttons': 'hard', 'icon-buttons': { pending: 'P3.10' } });
        expect(scopes('DS-HEIGHT-10')).toEqual({ ...main('P2.6'), sidebar: { pending: 'P2.6' } });
        expect(scopes('DS-HEIGHT-11')).toEqual({ 'main-installed': { pending: 'P2.8b' }, 'main-updates': { pending: 'P3.10' }, browse: { pending: 'P3.10' }, details: { pending: 'P3.10' }, sidebar: { pending: 'P3.10' } });
        // UX-P0.12: PF-2, PF-3a and PF-4 where P9.fix-2, -3 and -4 measured; MS-8 hard for chrome (Appendix B).
        expect(scopes('PF-2')).toEqual({ 'main-installed': 'hard' });
        expect(RULES.find(rule => rule.id === 'PF-2')?.states).toEqual(['main-transitive-expanded']);
        expect(scopes('PF-3a')).toEqual({ 'main-installed': 'hard' });
        expect(RULES.find(rule => rule.id === 'PF-3a')).toMatchObject({ states: ['main-installed-single'], widths: [1200] });
        expect(scopes('PF-4')).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard' });
        // UX-P0.14 (design trigger 1): PF-4 holds at every width it was asserted at in any lane, not at P0.14's narrow ones (V50).
        const pf4 = RULES.find(rule => rule.id === 'PF-4');
        expect(pf4?.widths).toEqual([800, 932, 1200, 1600]);
        expect([800, 932, 1200, 1600, 220, 400, 600].map(width => appliesTo(pf4!, 'main-installed-single', width))).toEqual([true, true, true, true, false, false, false]);
        expect(scopes('MS-8')).toEqual({ chrome: 'hard', 'first-row': { pending: 'P3.1b' } });
        // V72 closed at UX-P2.1a: the document never scrolls and the chrome holds still, hard in every state.
        expect(RULES.find(rule => rule.id === 'MS-8')?.pendingStates).toBeUndefined();
        expect(scopes('DS-OVERFLOW-6')).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard', browse: 'hard', details: 'hard', dialogs: 'hard', sources: 'hard', sidebar: 'hard' });
        expect(RULES.find(rule => rule.id === 'DS-OVERFLOW-6')?.pendingStates).toBeUndefined();
        // UX-P0.14 (design-advisor ruling): the main panel's 220 px width pending on P2.7 (V50), the width axis of pendingStates.
        expect(RULES.find(rule => rule.id === 'DS-OVERFLOW-6')?.pendingWidths).toEqual({ 220: 'P2.7' });
        expect(scopes('DS-INSET-3')).toEqual({ rows: 'hard', toolbars: 'hard', headers: { pending: 'P2.6' }, sidebar: { pending: 'P3.7a' } });
        expect(scopes('DS-OVERFLOW-2')).toEqual({ 'main-installed': { pending: 'P2.6' }, details: { pending: 'P2.6' }, sidebar: { pending: 'P2.6' } });
        expect(scopes('DS-ROW-5')).toEqual({ ...mainHard(), sidebar: { pending: 'P3.7a' } });
        // UX-P0.13 (design-advisor ruling of 2026-10-24): every Appendix B rule of a P0 helper, and the five on P0.18.
        expect(scopes('DS-INSET-4')).toEqual({ details: { pending: 'P3.3b' } });
        expect(scopes('DS-ROW-1')).toEqual(mainHard());
        expect(scopes('DS-ROW-2')).toEqual({ 'main-installed': { pending: 'P2.8a' }, details: { pending: 'P2.8a' }, browse: { pending: 'P3.2' } });
        expect(scopes('DS-ROW-3')).toEqual({ 'main-installed': 'hard', details: 'hard', 'main-updates': { pending: 'P3.1b' }, browse: { pending: 'P3.2' }, sidebar: { pending: 'P3.7a' } });
        expect(scopes('DS-ROW-6')).toEqual(mainHard());
        expect(scopes('DS-ICON-3')).toEqual(mainHard());
        // UX-P1.4b: the two states whose readiness holds a Verified mark.
        expect(scopes('DS-ICON-4')).toEqual({ details: 'hard' });
        expect(RULES.find(rule => rule.id === 'DS-ICON-4')?.states).toEqual(['main-installed-details', 'main-transitive-details']);
        expect(scopes('DS-DENSITY-1')).toEqual({ ...mainHard(), sidebar: { pending: 'P3.7a' } });
        expect(scopes('DS-OVERFLOW-1')).toEqual({ 'main-installed': { pending: 'P2.7' }, 'main-updates': { pending: 'P2.7' }, browse: { pending: 'P2.7' }, details: { pending: 'P3.3b' }, sidebar: { pending: 'P3.7a' } });
        expect(scopes('DS-OVERFLOW-3')).toEqual({ toolbars: 'hard', tabs: 'hard', details: { pending: 'P3.3b' } });
        expect(scopes('DS-OVERFLOW-5')).toEqual({ details: { pending: 'P3.3b' } });
        expect(scopes('DS-ALIGN-1')).toEqual({ details: { pending: 'P3.3a' } });
        // UX-P0.18 (design-advisor ruling of 2026-10-24): hard where the unchanged tree read green in every capture of the
        // group; the red groups and the groups no state measures yet to the items that make them hold.
        const hard = (...groups: string[]) => Object.fromEntries(groups.map(group => [group, 'hard']));
        expect(scopes('DS-TYPE-1')).toEqual({ ...hard('main-installed', 'main-updates', 'browse', 'details', 'dialogs', 'sidebar'), sources: { pending: 'P3.6' } });
        expect(scopes('DS-TYPE-4')).toEqual({ ...hard('main-installed', 'main-updates', 'browse', 'details', 'dialogs'), sidebar: { pending: 'P3.7a' }, sources: { pending: 'P3.6' } });
        expect(scopes('DS-TYPE-6')).toEqual({ ...hard('main-installed', 'main-updates', 'details', 'sidebar'), browse: { pending: 'P3.2' } });
        expect(scopes('DS-ROW-4')).toEqual(hard('main-installed', 'main-updates', 'browse', 'details', 'sidebar'));
        expect(scopes('DS-COPY-3')).toEqual({ 'main-installed': 'hard', 'main-updates': { pending: 'P3.1b' }, browse: { pending: 'P3.10' }, sidebar: { pending: 'P3.10' } });
        expect(RULES.find(rule => rule.id === 'DS-COPY-3')?.pendingStates).toEqual({ 'main-installed-unsupported': 'P2.8b' });
        // The Browse list under the details pane is a details-group state; its description waits for P3.2 (run 40114517304).
        expect(RULES.find(rule => rule.id === 'DS-TYPE-6')?.pendingStates).toEqual({ 'main-browse-details': 'P3.2' });
        // The states without a row by design: DS-TYPE-6 and DS-ROW-4 print nothing there, never a pass.
        const noRow = ['main-installed-filter-nomatch', 'main-quicksearch-open', 'main-quicksearch-versions'];
        for (const id of ['DS-TYPE-6', 'DS-ROW-4']) {
            const definition = RULES.find(rule => rule.id === id)!;
            expect(definition.exceptStates, id).toEqual(noRow);
            expect(noRow.map(state => appliesTo(definition, state)), id).toEqual([false, false, false]);
            expect(appliesTo(definition, 'main-installed-single'), id).toBe(true);
        }
        expect(scopes('SPEC')).toEqual({ 'main-installed': { pending: 'P2.8a' } });
        // UX-P0.14 (design-advisor ruling of 2026-10-24): the six of the research's 27 a ready state renders.
        expect(scopes('DS-FOCUS-1')).toEqual({ controls: 'hard', tabs: 'hard' });
        expect(scopes('DS-FOCUS-2')).toEqual({ rows: 'hard' });
        expect(scopes('DS-FOCUS-3')).toEqual({ rows: 'hard', tabs: 'hard' });
        expect(RULES.find(rule => rule.id === 'DS-FOCUS-3')?.states).toEqual(['main-installed-details', 'main-updates']);
        expect(scopes('DS-FOCUS-4')).toEqual({ rows: 'hard' });
        expect(RULES.find(rule => rule.id === 'DS-FOCUS-4')?.themes).toEqual(['dark-high-contrast', 'light-high-contrast']);
        expect(scopes('DS-STATE-7')).toEqual({ 'main-installed': { pending: 'P2.8a' }, 'main-updates': { pending: 'P2.8a' }, browse: { pending: 'P2.8a' }, details: { pending: 'P3.3b' } });
        // UX-P0.22 (V15): the token scrollbars in every group, pending on P3.9 (Modern UI's 8 px needs P1.1's look token).
        expect(scopes('DS-SCROLL-1')).toEqual(Object.fromEntries(['main-installed', 'main-updates', 'browse', 'details', 'dialogs', 'sources', 'sidebar'].map(group => [group, { pending: 'P3.9' }])));
        // Each rule's tolerance is one of D34's.
        expect(Object.fromEntries(RULES.map(rule => [rule.id, rule.tolerance]))).toEqual({
            'PF-6': 1, 'DS-GRID-1': 0.5, 'DS-GRID-2a': 0.5, 'DS-GRID-2b': 2, 'DS-INSET-1': 1, 'DS-INSET-2': 1, 'PF-3b': 1, 'PF-5': 1,
            ...Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`DS-HEIGHT-${i + 1}`, 1])),
            'PF-2': 1, 'PF-3a': 0, 'PF-4': 1, 'MS-8': 0.5, 'DS-OVERFLOW-6': 0, 'DS-INSET-3': 1, 'DS-OVERFLOW-2': 0, 'DS-ROW-5': 0,
            'DS-INSET-4': 1, 'DS-ROW-1': 1, 'DS-ROW-2': 1, 'DS-ROW-3': 0, 'DS-RADIUS-1': 0, 'DS-COLOR-6': 0, 'DS-ICON-2': 0, 'DS-COLOR-4': 0, 'DS-COLOR-7': 0, 'DS-COLOR-3': 0, 'DS-COLOR-2': 0, 'DS-DIVIDER-1': 0, 'DS-RADIUS-2': 0, 'DS-COLOR-5': 0, 'DS-ROW-6': 0, 'DS-ICON-3': 0, 'DS-DENSITY-1': 1, 'DS-OVERFLOW-1': 0, 'DS-OVERFLOW-3': 0,
            'DS-OVERFLOW-5': 0, 'DS-ALIGN-1': 0, 'DS-TYPE-1': 0, 'DS-TYPE-4': 0.5, 'DS-TYPE-6': 0.1, 'DS-ROW-4': 0, 'DS-COPY-3': 0, SPEC: 1,
            'DS-FOCUS-1': 0, 'DS-FOCUS-2': 0, 'DS-FOCUS-3': 0, 'DS-FOCUS-4': 0, 'DS-STATE-7': 0, 'DS-SCROLL-1': 0, 'DS-TYPE-2': 0.1, 'DS-TYPE-3': 0, 'DS-ICON-4': 0, 'DS-LOOK-1': 0,
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
        expect(groups['main-browse-details']).toBe('details');
        expect(stateGroup('main-sources-list')).toBe('sources');
    });

    it('never stays silent: every scope with a status prints not measurable on an empty layout, and so does a missing root', () => {
        for (const rule of RULES) {
            for (const scope of Object.keys(rule.scopes) as Scope[]) {
                // A state the rule applies to (at its first width, else at 1200, PF-3a's; in its first theme, DS-FOCUS-4's) whose
                // group or element groups hold the scope.
                const width = rule.widths?.[0] ?? 1200;
                const theme = rule.themes?.[0] ?? 'dark-modern';
                const state = CANDIDATES.find(candidate => appliesTo(rule, candidate, width, theme) && rule.scopeStates?.[scope]?.includes(candidate) !== false
                    && (stateGroup(candidate) === scope || elementGroups(stateGroup(candidate), candidate).includes(scope as never))) as string;
                expect(state, `a state for ${rule.id}/${scope}`).toBeDefined();
                const name = stateGroup(state) === scope ? `${rule.id}@${state}` : `${rule.id}@${state}/${scope}`;
                const line = measureLines(state, layout(), 'modern', {}, undefined, width, undefined, theme).find(candidate => candidate.name === name);
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
        expect(toolbar({ start: 16, end: 6, top: 4, bottom: 4 })).toMatchObject({ value: '16/6 4/4', pass: false, status: 'hard' });
        expect(toolbar({ start: 16, end: 16, top: 4, bottom: 4 })).toMatchObject({ value: '16/16 4/4', pass: true, status: 'hard' });
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

    it('reads WebDriver\'s null as absent: not measurable, never "null" and never a throw', () => {
        // executeScript returns the collector's undefined as null.
        const fromDriver = JSON.parse(JSON.stringify({
            ...layout({
                mainLefts: { ...at16, row: undefined }, mainRegionLeft: 0, toolbars: [{ id: 'installed-toolbar', insets: undefined }], sections: [{ id: 'transitive', variant: 'group', insets: undefined, above: 20, below: undefined }],
                centring: [{ name: 'Serilog', row: 10, check: undefined, icon: 10 }, { name: 'Moq', row: 90, check: 90, icon: 90 }], detailsButtons: { uninstall: undefined, update: { left: 1, height: 24 } },
            }),
        }, (_key, value: unknown) => (value === undefined ? null : value))) as Layout;
        expect(fromDriver.mainLefts.row).toBeNull();
        const lines = measureLines('main-installed-single', fromDriver, 'modern');
        expect(lines.find(line => line.name === 'PF-6@main-installed-single')).toMatchObject({ pass: false, value: 'not measurable (row)' });
        expect(lines.find(line => line.name === 'DS-GRID-2b@main-installed-single')).toMatchObject({ pass: false, value: 'not measurable' });
        expect(lines.find(line => line.name === 'DS-INSET-2@main-installed-single/toolbars')).toMatchObject({ value: 'not measurable' });
        expect(lines.find(line => line.name === 'PF-3b@main-installed-single')).toMatchObject({ pass: false, value: 'not measurable (no check box in Serilog)' });
        expect(lines.some(line => line.value.includes('null'))).toBe(false);
        expect(lineOf('main-installed-details', fromDriver, 'PF-5@main-installed-details')).toMatchObject({ pass: false, value: 'not measurable (uninstall-button)' });
    });

    it('measures the sidebar\'s insets against its look', () => {
        const sidebar = { rootLeft: 0, titles: [28], names: [28], search: 8 };
        const modern = measureLines('sidebar-sections', layout({ sidebar }), 'modern').find(line => line.name === 'DS-INSET-1@sidebar-sections');
        const classic = measureLines('sidebar-sections', layout({ sidebar }), 'classic').find(line => line.name === 'DS-INSET-1@sidebar-sections');
        expect(modern).toMatchObject({ pass: true, status: { pending: 'P3.7a' } });
        expect(classic).toMatchObject({ pass: false });
    });

    it('PF-3b measures the check box alone where DS-ROW-6 hides the icon (UX-P2.2)', () => {
        const rows = layout({ centring: [{ name: 'Serilog', row: 100, check: 100, icon: undefined }, { name: 'Moq', row: 180, check: 180, icon: undefined }] });
        expect(lineOf('main-installed-single', rows, 'PF-3b@main-installed-single')).toMatchObject({ pass: true, status: 'hard' });
        expect(lineOf('main-installed-single', rows, 'PF-3b@main-installed-single')?.value).toContain('icon hidden');
    });

    it('holds PF-3b to P9.fix-3\'s centring of the check box and the icon within 1 px (helper 4)', () => {
        const rows = (offset: number, icon: number | null = 0) => layout({ centring: [{ name: 'Serilog', row: 100, check: 100.5, icon: icon === null ? undefined : 100 + icon }, { name: 'Moq', row: 180, check: 180 + offset, icon: 180 }] });
        expect(lineOf('main-installed-single', rows(0.5), 'PF-3b@main-installed-single')).toMatchObject({ pass: true, status: 'hard', value: 'check box 0.5 ×2; icon 0 ×2 (centre offsets, 2 rows; first Serilog: row 100, check 100.5, icon 100)' });
        expect(lineOf('main-updates', rows(1.5), 'PF-3b@main-updates')).toMatchObject({ pass: false, status: 'hard' });
        // A red line locates its defect too: the first row's absolute centres (UX-P0.17).
        expect(lineOf('main-updates', rows(1.5), 'PF-3b@main-updates')?.value).toContain('first Serilog: row 100, check 100.5, icon 100');
        // As P9.fix-3: two rows at least, each with its check box.
        expect(lineOf('main-installed-single', layout(), 'PF-3b@main-installed-single')).toMatchObject({ pass: false, value: 'not measurable (fewer than 2 rows)' });
        expect(lineOf('main-installed-single', layout({ centring: [{ name: 'Moq', row: 10, check: 10, icon: 10 }] }), 'PF-3b@main-installed-single')).toMatchObject({ pass: false, value: 'not measurable (fewer than 2 rows)' });
        expect(lineOf('main-installed-single', layout({ centring: [{ name: 'Serilog', row: 100, check: undefined, icon: 100 }, { name: 'Moq', row: 180, check: 180, icon: 180 }] }), 'PF-3b@main-installed-single')).toMatchObject({ pass: false, value: 'not measurable (no check box in Serilog)' });
        // Only the two states P9.fix-3's tests cover.
        expect(lineOf('main-installed-cpm', rows(0), 'PF-3b@main-installed-cpm')).toBeUndefined();
    });

    it('holds PF-5 to one left edge and one height for Uninstall and Update', () => {
        const buttons = (uninstall: { left: number; height: number } | undefined, update: { left: number; height: number }) => layout({ detailsButtons: { uninstall, update } });
        expect(lineOf('main-installed-details', buttons({ left: 619.5, height: 24 }, { left: 619.5, height: 24 }), 'PF-5@main-installed-details')).toMatchObject({ pass: true, status: 'hard', value: 'left 619.5/619.5, height 24/24' });
        expect(lineOf('main-installed-details', buttons({ left: 610, height: 24 }, { left: 619.5, height: 24 }), 'PF-5@main-installed-details')).toMatchObject({ pass: false });
        expect(lineOf('main-installed-details', buttons({ left: 619.5, height: 22 }, { left: 619.5, height: 24 }), 'PF-5@main-installed-details')).toMatchObject({ pass: false });
        expect(lineOf('main-installed-details', buttons(undefined, { left: 619.5, height: 24 }), 'PF-5@main-installed-details')).toMatchObject({ pass: false, value: 'not measurable (uninstall-button)' });
    });

    it('checks heights against the Design System and, for a parity rule, against the workbench of the same run (helper 3)', () => {
        const rows = layout({}, { comfortableRows: [78, 78, 78], comfortablePitches: [79, 79] });
        expect(lineOf('main-installed-single', rows, 'DS-HEIGHT-3@main-installed-single')).toMatchObject({ pass: false, status: 'hard', value: 'rows 78 ×3 (target 72); pitch 79 ×2 (target 72)' });
        expect(lineOf('main-installed-single', layout({}, { comfortableRows: [72, 72], comfortablePitches: [72] }), 'DS-HEIGHT-3@main-installed-single')).toMatchObject({ pass: true });
        // DS-HEIGHT-6: the height, the workbench's button and the computed styles.
        const button = { height: 26, fontSize: '12px', lineHeight: '16px', padding: '4px 8px 4px 8px', radius: '4px', disabled: false, opacity: '1', hovered: false, secondary: false, background: 'rgba(0, 0, 0, 0)' };
        const buttons = layout({}, { buttons: [button, { ...button, height: 24, fontSize: '13px' }] });
        expect(lineOf('main-installed-details', buttons, 'DS-HEIGHT-6@main-installed-details', 'modern', { settingsButton: 26 }))
            .toMatchObject({ pass: false, value: '24, 26 (target 26, workbench 26); fontSize 13px (target 12px)' });
        expect(lineOf('main-installed-details', layout({}, { buttons: [button] }), 'DS-HEIGHT-6@main-installed-details', 'modern', { settingsButton: 26 })).toMatchObject({ pass: true });
        // Without the workbench's value a parity rule cannot pass.
        expect(lineOf('main-installed-details', layout({}, { buttons: [button] }), 'DS-HEIGHT-6@main-installed-details')).toMatchObject({ pass: false, value: '26 (target 26, workbench absent)' });
        // DS-HEIGHT-7 per kind of control.
        const inputs = layout({}, { inputs: [{ kind: 'search', id: 'search-input', height: 24, radius: '4px' }, { kind: 'select', id: 'project-selector', height: 26, radius: '4px' }, { kind: 'select', id: 'source-selector', height: 26, radius: '4px' }] });
        // A text field other than a search box is 25 px, the Settings editor's (UX-P2.4).
        const field = (height: number) => layout({}, { inputs: [{ kind: 'field', id: 'url', height, radius: '4px' }] });
        expect(lineOf('main-installed-single', field(25), 'DS-HEIGHT-7@main-installed-single', 'modern', { settingsInput: 25 })).toMatchObject({ pass: true });
        expect(lineOf('main-installed-single', field(27), 'DS-HEIGHT-7@main-installed-single', 'modern', { settingsInput: 25 })).toMatchObject({ pass: false });
        expect(lineOf('main-installed-single', inputs, 'DS-HEIGHT-7@main-installed-single', 'modern', { extensionsSearch: 26, settingsSelect: 26 }))
            .toMatchObject({ pass: false, value: 'search 24 (target 26, workbench 26); select 26 ×2 (target 26, workbench 26)' });
        // DS-HEIGHT-1 by look, on the sidebar's pane headers.
        const headers = layout({}, { headers: [{ id: 'installed', variant: 'pane', height: 22 }, { id: 'net8.0', variant: 'level', height: 18 }] });
        expect(lineOf('sidebar-sections', headers, 'DS-HEIGHT-1@sidebar-sections', 'classic')).toMatchObject({ pass: true, value: '22 (target 22)' });
        expect(lineOf('sidebar-sections', headers, 'DS-HEIGHT-1@sidebar-sections', 'modern')).toMatchObject({ pass: false, value: '22 (target 28)' });
        expect(lineOf('main-installed-single', headers, 'DS-HEIGHT-1@main-installed-single')).toBeUndefined();
        // DS-HEIGHT-2: compact rows.
        expect(lineOf('sidebar-sections', layout({}, { compactRows: [22, 22] }), 'DS-HEIGHT-2@sidebar-sections')).toMatchObject({ pass: true, value: '22 ×2 (target 22)' });
        expect(lineOf('sidebar-sections', layout({}, { compactRows: [22, 26] }), 'DS-HEIGHT-2@sidebar-sections')).toMatchObject({ pass: false });
        // DS-HEIGHT-4 and -5 take their parity from the extension editor's navbar.
        expect(lineOf('main-installed-details', layout({}, { tabStrip: 36, detailsTabs: 30 }), 'DS-HEIGHT-4@main-installed-details', 'modern', { extensionNavbar: 36 })).toMatchObject({ pass: true, value: '36 (target 36, workbench 36)' });
        expect(lineOf('main-installed-details', layout({}, { tabStrip: 36, detailsTabs: 30 }), 'DS-HEIGHT-5@main-installed-details', 'modern', { extensionNavbar: 36 })).toMatchObject({ pass: false, value: '30 (target 36, workbench 36)' });
        expect(lineOf('main-installed-details', layout({}, { tabStrip: 36 }), 'DS-HEIGHT-4@main-installed-details', 'modern', { extensionNavbar: 33 })).toMatchObject({ pass: false, value: '36 (target 36, workbench 33)' });
    });

    it('checks icon buttons, check boxes, badges and the progress bar', () => {
        const icons = layout({}, { iconButtons: [iconButton({ width: 24, height: 24 }), iconButton({ inHeader: true, width: 20, height: 20 })] });
        expect(lineOf('sidebar-sections', icons, 'DS-HEIGHT-8@sidebar-sections')).toMatchObject({ pass: false, value: 'painted 24×24 (target 22×22); section header 20×20 (target 20×20); hit 24 ×2 (at least 24)' });
        // The target is a minimum: 23 px fails, whatever the painted box.
        const target = (hit: number) => layout({}, { iconButtons: [iconButton({ hit: { width: hit, height: hit } })] });
        expect(lineOf('sidebar-sections', target(24), 'DS-HEIGHT-8@sidebar-sections')).toMatchObject({ pass: true });
        expect(lineOf('sidebar-sections', target(23), 'DS-HEIGHT-8@sidebar-sections')).toMatchObject({ pass: false });
        const boxes = layout({}, {
            checkBoxes: [{ width: 18, height: 18, radius: '3px', selected: { fill: 'rgb(0, 120, 212)', border: 'rgba(0, 120, 212, 0.5)' } }, { width: 13, height: 13, radius: '2px', selected: undefined }],
            checkSelect: { fill: '#0078d4', border: '#0078d480' },
        });
        expect(lineOf('main-installed-single', boxes, 'DS-HEIGHT-9@main-installed-single')).toMatchObject({ pass: false, value: '13×13, 18×18 (target 18×18); radius 2px (target 3px); selected in checkbox.selectBackground/selectBorder (#0078d4/#0078d480)' });
        const selected = (fill: string) => layout({}, { checkBoxes: [{ width: 18, height: 18, radius: '3px', selected: { fill, border: 'rgba(0, 120, 212, 0.5)' } }], checkSelect: { fill: '#0078d4', border: '#0078d480' } });
        expect(lineOf('main-installed-single', selected('rgb(0, 120, 212)'), 'DS-HEIGHT-9@main-installed-single')).toMatchObject({ pass: true });
        expect(lineOf('main-installed-single', selected('rgb(49, 49, 49)'), 'DS-HEIGHT-9@main-installed-single')).toMatchObject({ pass: false, value: expect.stringContaining('selected not in checkbox.selectBackground/selectBorder') });
        // A current off mark keeps its disabledForeground line and still counts for size and radius (UX-P2.3).
        const offMark = layout({}, { checkBoxes: [{ width: 18, height: 18, radius: '3px', selected: undefined, off: true }], checkSelect: { fill: '#0078d4', border: '#0078d480' } });
        expect(lineOf('main-installed-single', offMark, 'DS-HEIGHT-9@main-installed-single')).toMatchObject({ pass: true, value: expect.stringContaining('off 1 (line in disabledForeground, not read for checkbox.select*)') });
        const badges = layout({}, { badges: [{ count: true, width: 19, height: 19, fontSize: '10px', padding: '4px 6px 4px 6px', radius: '9999px' }, { count: false, width: 30, height: 18, fontSize: '11px', padding: '0px 4px 0px 4px', radius: '2px' }] });
        expect(lineOf('main-installed-single', badges, 'DS-HEIGHT-10@main-installed-single')).toMatchObject({ pass: false, value: expect.stringContaining('label fontSize 11px (target 10px)') });
        const modernBadges = layout({}, { badges: [{ count: true, width: 19, height: 19, fontSize: '10px', padding: '4px 6px 4px 6px', radius: '9999px' }, { count: false, width: 40, height: 18, fontSize: '10px', padding: '4px 6px 4px 6px', radius: '9999px' }] });
        expect(lineOf('main-installed-single', modernBadges, 'DS-HEIGHT-10@main-installed-single')).toMatchObject({ pass: true, value: 'count 19×19 (at least 19×19); label 1' });
        expect(lineOf('main-installed-single', badges, 'DS-HEIGHT-10@main-installed-single', 'classic')?.value).toContain('count fontSize 10px (target 11px)');
        // The progress bar only in a loading state.
        expect(lineOf('main-installed-loading', layout({}, { progress: [2] }), 'DS-HEIGHT-11@main-installed-loading')).toMatchObject({ pass: true, status: { pending: 'P2.8b' } });
        expect(lineOf('main-installed-single', layout({}, { progress: [2] }), 'DS-HEIGHT-11@main-installed-single')).toBeUndefined();
    });

    it('holds PF-2 to P9.fix-2\'s one scroller and at most two block gaps under the last direct row', () => {
        const gap = (headerTop: number, sameScroller = true) => layout({ transitiveGap: { lastRowBottom: 308, headerTop, sameScroller } });
        expect(lineOf('main-transitive-expanded', gap(308), 'PF-2@main-transitive-expanded')).toMatchObject({ pass: true, status: 'hard', value: 'gap 0 (at most 16; last direct row 308, transitive header 308, one scroller)' });
        expect(lineOf('main-transitive-expanded', gap(324), 'PF-2@main-transitive-expanded')).toMatchObject({ pass: true });
        expect(lineOf('main-transitive-expanded', gap(325), 'PF-2@main-transitive-expanded')).toMatchObject({ pass: false });
        expect(lineOf('main-transitive-expanded', gap(306), 'PF-2@main-transitive-expanded')).toMatchObject({ pass: false });
        expect(lineOf('main-transitive-expanded', gap(308, false), 'PF-2@main-transitive-expanded')).toMatchObject({ pass: false });
        expect(lineOf('main-transitive-expanded', layout(), 'PF-2@main-transitive-expanded')).toMatchObject({ pass: false, value: 'not measurable (no direct row or transitive header)' });
    });

    it('holds PF-3a to authors that are not cut, at the 1200 px panel only', () => {
        const row = (name: string, authorsCut: boolean | undefined, list = 'installed-list') => ({ list, compact: false, name, nameCut: false, nameEllipsis: true, authorsCut, versionShown: true, versionCut: false, badgesShown: 0, badgesClipped: 0, actionsEnd: undefined });
        const rows = (cut: boolean, width = 1200) => layout({ width, rows: [row('Serilog', false), row('Dapper', cut), row('Moq', undefined), row('Polly', true, 'updates-list')] });
        expect(lineOf('main-installed-single', rows(false), 'PF-3a@main-installed-single')).toMatchObject({ pass: true, status: 'hard', value: '2 authors, none cut' });
        expect(lineOf('main-installed-single', rows(true), 'PF-3a@main-installed-single')).toMatchObject({ pass: false, value: 'cut: Dapper (of 2)' });
        expect(lineOf('main-installed-single', rows(true, 932), 'PF-3a@main-installed-single')).toBeUndefined();
        // The capture's own width decides, not the webview's.
        expect(measureLines('main-installed-single', rows(true, 1185), 'modern', {}, undefined, 1200).find(line => line.name === 'PF-3a@main-installed-single')).toMatchObject({ pass: false });
        expect(measureLines('main-installed-single', rows(true, 1200), 'modern', {}, undefined, 932).some(line => line.name.startsWith('PF-3a'))).toBe(false);
        expect(lineOf('main-installed-single', layout(), 'PF-3a@main-installed-single')).toMatchObject({ pass: false, value: 'not measurable (no authors)' });
    });

    it('holds PF-4 to the pane\'s inset line at MS-1\'s 1 px (UX-P2.5)', () => {
        // The list's edge is its scroll port's; the listbox's own edge is printed beside it (design-advisor ruling of 2026-10-24).
        const edges = (button: number) => layout({ primaryEdges: [{ list: 'installed-list', button, listRight: 420, listboxRight: 420 }] });
        expect(lineOf('main-installed-single', edges(404), 'PF-4@main-installed-single')).toMatchObject({ pass: true, status: 'hard', value: 'installed-list: button 404, inset line 404 (scroll port 420 − 16; listbox 420)' });
        expect(lineOf('main-updates', edges(414), 'PF-4@main-updates')).toMatchObject({ pass: false });
        expect(lineOf('main-updates', layout(), 'PF-4@main-updates')).toMatchObject({ pass: false, value: 'not measurable (no primary toolbar button)' });
    });

    it('holds MS-8 to chrome that does not move from the first state of its surface, theme, width and look', () => {
        const header = { left: 0, top: 0, width: 1200, height: 56 };
        const tabs = { left: 0, top: 90, width: 1200, height: 25 };
        const reference = { state: 'main-installed-single', chrome: { 'main-header': header, 'tab-bar': tabs, search: undefined }, firstRow: 160 };
        const now = (chrome: Record<string, typeof header | undefined>, firstRow?: number) => layout({ chrome, firstRow });
        expect(measureLines('main-installed-single', now({ 'main-header': header }), 'modern').find(line => line.name === 'MS-8@main-installed-single/chrome'))
            .toMatchObject({ pass: true, status: 'hard', value: 'reference (main-header 0,0 1200×56)' });
        expect(measureLines('main-installed-details', now({ 'main-header': { ...header, height: 56.4 }, 'tab-bar': tabs }), 'modern', {}, reference).find(line => line.name === 'MS-8@main-installed-details/chrome'))
            .toMatchObject({ pass: true, value: 'still (as main-installed-single)' });
        expect(measureLines('main-installed-details', now({ 'main-header': { ...header, height: 60 }, 'tab-bar': tabs }), 'modern', {}, reference).find(line => line.name === 'MS-8@main-installed-details/chrome'))
            .toMatchObject({ pass: false, value: 'moved against main-installed-single: main-header 0,0 1200×56 → 0,0 1200×60' });
        // Chrome that disappears fails, but the tab strip while the Browse view is shown (keyed on the DOM, not on names).
        expect(measureLines('main-installed-details', now({ 'main-header': header }), 'modern', {}, reference).find(line => line.name === 'MS-8@main-installed-details/chrome'))
            .toMatchObject({ pass: false, value: 'still (as main-installed-single); not shown: tab-bar' });
        const browsing = layout({ chrome: { 'main-header': header }, browsing: true });
        for (const state of ['main-browse-results', 'main-browse-details', 'main-quicksearch-open']) {
            expect(measureLines(state, browsing, 'modern', {}, reference).find(line => line.name === `MS-8@${state}/chrome`))
                .toMatchObject({ pass: true, value: 'still (as main-installed-single); not shown: tab-bar (browsing)' });
        }
        expect(measureLines('main-browse-results', now({ 'main-header': header }), 'modern', {}, reference).find(line => line.name === 'MS-8@main-browse-results/chrome'))
            .toMatchObject({ pass: false });
        // The reference state passes its own first row.
        expect(measureLines('main-installed-single', now({ 'main-header': header }, 160), 'modern').find(line => line.name === 'MS-8@main-installed-single/first-row'))
            .toMatchObject({ pass: true, value: 'reference 160' });
        // The Installed↔Updates first-row y waits for P3.1b, and is compared in those two states only.
        expect(measureLines('main-updates', now({ 'main-header': header }, 172), 'modern', {}, reference).find(line => line.name === 'MS-8@main-updates/first-row'))
            .toMatchObject({ pass: false, status: { pending: 'P3.1b' }, value: '172 (main-installed-single 160)' });
        expect(measureLines('main-installed-details', now({ 'main-header': header }, 172), 'modern', {}, reference).some(line => line.name.endsWith('/first-row'))).toBe(false);
        // WebDriver's nulls in the reference read as absent.
        const fromDriver = JSON.parse(JSON.stringify(reference, (_key, value: unknown) => (value === undefined ? null : value)));
        expect(measureLines('main-installed-details', now({ 'main-header': header, search: header, 'tab-bar': tabs }), 'modern', {}, fromDriver).find(line => line.name === 'MS-8@main-installed-details/chrome'))
            .toMatchObject({ pass: true });
    });

    it('holds MS-8\'s chrome and DS-OVERFLOW-6 hard in V72\'s four states too, and asserts the document never scrolls (UX-P2.1a)', () => {
        const scrolling = layout({ chrome: { 'main-header': { left: 0, top: 0, width: 1185, height: 36 } }, documentOverflow: { clientWidth: 1185, clientHeight: 803, scrollWidth: 1185, scrollHeight: 2410, outside: '.nuiget-installed-lists 0,135 420×2275' } });
        const reference = { state: 'main-installed-single', chrome: { 'main-header': { left: 0, top: 0, width: 1200, height: 36 } }, firstRow: undefined };
        const status = (state: string, name: string) => measureLines(state, scrolling, 'modern', {}, reference).find(line => line.name === `${name}@${state}${name === 'MS-8' ? '/chrome' : ''}`)?.status;
        expect(status('main-transitive-expanded', 'MS-8')).toBe('hard');
        expect(status('main-transitive-details', 'DS-OVERFLOW-6')).toBe('hard');
        expect(status('main-installed-all', 'MS-8')).toBe('hard');
        expect(status('main-installed-all', 'DS-OVERFLOW-6')).toBe('hard');
        expect(status('main-installed-cpm', 'DS-OVERFLOW-6')).toBe('hard');
        expect(status('main-installed-single', 'DS-OVERFLOW-6')).toBe('hard');
        expect(status('main-installed-details', 'MS-8')).toBe('hard');
        expect(lineOf('main-installed-all', scrolling, 'DS-OVERFLOW-6@main-installed-all'))
            .toMatchObject({ pass: false, value: 'document 1185×803, scroll 1185×2410 (+1607); outside: .nuiget-installed-lists 0,135 420×2275' });
        const fitting = layout({ documentOverflow: { clientWidth: 1200, clientHeight: 803, scrollWidth: 1200, scrollHeight: 803, outside: undefined } });
        expect(lineOf('sidebar-sections', fitting, 'DS-OVERFLOW-6@sidebar-sections')).toMatchObject({ pass: true, status: 'hard', value: 'document 1200×803 fits' });
        expect(lineOf('main-installed-single', layout(), 'DS-OVERFLOW-6@main-installed-single')).toMatchObject({ pass: false, value: 'not measurable' });
        const unseen = layout({ documentOverflow: { clientWidth: 1185, clientHeight: 803, scrollWidth: 1185, scrollHeight: 900, outside: undefined } });
        expect(lineOf('main-installed-all', unseen, 'DS-OVERFLOW-6@main-installed-all')?.value).toBe('document 1185×803, scroll 1185×900 (+97); outside: none past the viewport');
    });

    it('pends DS-OVERFLOW-6 at the main panel\'s 220 px width on P2.7 (V50) in every state that has that width (UX-P0.14)', () => {
        const sideways = layout({ documentOverflow: { clientWidth: 205, clientHeight: 788, scrollWidth: 231, scrollHeight: 803, outside: '.nuiget-badge 198.3,224.5 24.1×17.5' } });
        const at = (state: string, width: number) => measureLines(state, sideways, 'modern', {}, undefined, width).find(line => line.name === `DS-OVERFLOW-6@${state}`);
        expect(at('main-installed-single', 220)).toMatchObject({ status: { pending: 'P2.7' }, pass: false, value: 'document 205×788, scroll 231×803 (+15); outside: .nuiget-badge 198.3,224.5 24.1×17.5' });
        expect(at('main-installed-single', 220.6)?.status).toEqual({ pending: 'P2.7' });
        expect(at('main-installed-single', 400)?.status).toBe('hard');
        expect(at('main-installed-single', 1200)?.status).toBe('hard');
        expect(at('main-installed-single', 1600)?.status).toBe('hard');
        expect(at('main-installed-all', 220)?.status).toEqual({ pending: 'P2.7' });
        // PF-6 waits there, and at 400, since UX-P2.5: the tab label has no box until P2.7's pane minimum.
        expect(measureLines('main-installed-single', sideways, 'modern', {}, undefined, 220).find(line => line.name === 'PF-6@main-installed-single')?.status).toEqual({ pending: 'P2.7' });
    });

    it('checks DS-INSET-3\'s trailing ends, DS-OVERFLOW-2\'s collisions and DS-ROW-5\'s truncation order', () => {
        const row = (name: string, overrides: Record<string, unknown> = {}) => ({ list: 'installed-list', compact: false, name, nameCut: false, nameEllipsis: true, authorsCut: undefined, versionShown: true, versionCut: false, badgesShown: 0, badgesClipped: 0, actionsEnd: undefined, ...overrides });
        const built = layout({
            rows: [row('Serilog', { actionsEnd: 6 }), row('Moq', { actionsEnd: 2 }), row('Polly', { compact: true, actionsEnd: 6 })],
            sections: [{ id: 'direct', variant: 'group', insets: undefined, above: undefined, below: undefined, trailingEnd: 16 }, { id: 'installed', variant: 'pane', insets: undefined, above: undefined, below: undefined, trailingEnd: 2 }],
            toolbars: [{ id: 'installed-toolbar', insets: { start: 16, end: 6, top: 4, bottom: 4 } }],
        });
        expect(lineOf('main-installed-hover', built, 'DS-INSET-3@main-installed-hover/rows')).toMatchObject({ pass: false, status: 'hard', value: 'row actions 2, 6 (target 6)' });
        expect(lineOf('main-installed-single', built, 'DS-INSET-3@main-installed-single/headers')).toMatchObject({ pass: true, status: { pending: 'P2.6' }, value: 'group headers 16 (target 16)' });
        expect(lineOf('main-installed-single', built, 'DS-INSET-3@main-installed-single/toolbars')).toMatchObject({ pass: false, status: 'hard', value: 'toolbar end 6 (target 16)' });
        expect(lineOf('main-installed-single', layout({ toolbars: [{ id: 'installed-toolbar', insets: { start: 16, end: 16, top: 4, bottom: 4 } }] }), 'DS-INSET-3@main-installed-single/toolbars')).toMatchObject({ pass: true, value: 'toolbar end 16 (target 16)' });
        expect(lineOf('sidebar-sections', built, 'DS-INSET-3@sidebar-sections', 'classic')).toMatchObject({ pass: false, value: 'section headers 2 (target 12); row actions 6 (target 6)' });
        // DS-OVERFLOW-2 prints every section-header badge's rect, offending or not, and passes no empty page.
        const overflow = layout({ overflow: { containers: 9, collisions: [], outside: ['[section-box-project-unsupported.csproj] .nuiget-badge 1171–1195 outside 16–1184'], clipped: [], count: 1, badges: ['project-unsupported.csproj "Unsupported" 1171–1195 (box right 1200)'] } });
        expect(lineOf('main-installed-all', overflow, 'DS-OVERFLOW-2@main-installed-all')).toMatchObject({
            pass: false, status: { pending: 'P2.6' },
            value: '1 offending in 9 containers (outside: [section-box-project-unsupported.csproj] .nuiget-badge 1171–1195 outside 16–1184); badges: project-unsupported.csproj "Unsupported" 1171–1195 (box right 1200)',
        });
        expect(lineOf('main-installed-all', layout(), 'DS-OVERFLOW-2@main-installed-all')).toMatchObject({ pass: false, value: 'not measurable' });
        // DS-ROW-5: on a compact row's one line a name cut beside an uncut version is cut too early; a comfortable name ellipsizes beside whole badges.
        const truncation = layout({ rows: [
            row('Microsoft.Extensions.Logging', { nameCut: true, badgesShown: 1 }), row('Microsoft.Extensions.Hosting', { nameCut: true }),
            row('Polly', { compact: true, nameCut: true, versionShown: false }), row('Serilog.Sinks.Console', { compact: true, nameCut: true, versionCut: true }),
            row('Newtonsoft.Json', { compact: true, nameCut: true }),
        ] });
        expect(lineOf('main-installed-single', truncation, 'DS-ROW-5@main-installed-single')).toMatchObject({ pass: true, value: '2 rows, 2 names cut; badges clipped 0' });
        expect(lineOf('main-installed-single', layout({ rows: [row('Newtonsoft.Json', { badgesShown: 1, badgesClipped: 1 })] }), 'DS-ROW-5@main-installed-single')).toMatchObject({ pass: false, value: '1 rows, 0 names cut; badges clipped 1' });
        expect(lineOf('sidebar-sections', truncation, 'DS-ROW-5@sidebar-sections')).toMatchObject({ pass: false, status: { pending: 'P3.7a' }, value: '3 rows, 3 names cut; cut before the version: Newtonsoft.Json' });
    });

    it('checks the rules registered at the end of P0 (UX-P0.13)', () => {
        const band = { left: 0, top: 100, right: 400, bottom: 172 };
        const row = (overrides: Record<string, unknown> = {}) => ({
            list: 'installed-list', compact: false, band, painted: undefined, state: 'rest', icon: { left: 46, right: 82, w: 36, h: 36, centre: 136, radius: '2px' },
            nameLeft: 98, textCentre: 136, lines: 2, actions: 1, ...overrides,
        });
        const facts = (overrides: Record<string, unknown>) => layout({ endOfP0: { ...layout().endOfP0, fonts: { root: 'sans', others: [] }, ...overrides } as Layout['endOfP0'] });
        const value = (state: string, built: Layout, name: string) => lineOf(state, built, name);
        // DS-ROW-1: icon 36, name 16 after it, centred, two lines (three in Browse).
        expect(value('main-installed-single', facts({ rows: [row()] }), 'DS-ROW-1@main-installed-single')).toMatchObject({ pass: true, status: 'hard' });
        expect(value('main-browse-results', facts({ rows: [row({ list: 'browse-list' })] }), 'DS-ROW-1@main-browse-results')).toMatchObject({ pass: false });
        expect(value('main-installed-single', facts({ rows: [row({ nameLeft: 94 })] }), 'DS-ROW-1@main-installed-single')).toMatchObject({ pass: false });
        // DS-ROW-2: one icon and name column.
        expect(value('main-transitive-expanded', facts({ rows: [row(), row({ nameLeft: 100 })] }), 'DS-ROW-2@main-transitive-expanded')).toMatchObject({ pass: false, value: 'icon left spread 0, name left spread 2 (2 rows)' });
        expect(value('main-transitive-expanded', facts({ rows: [row(), row()] }), 'DS-ROW-2@main-transitive-expanded')).toMatchObject({ pass: true });
        // DS-ROW-3: the painted box of a selected row is the band.
        expect(value('main-installed-details', facts({ rows: [row({ state: 'current', painted: { ...band, left: 4, right: 396 } })] }), 'DS-ROW-3@main-installed-details')).toMatchObject({ pass: false, value: 'current painted 4 from the band' });
        expect(value('main-installed-hover', facts({ rows: [row({ state: 'hover', painted: band })] }), 'DS-ROW-3@main-installed-hover')).toMatchObject({ pass: true });
        // DS-ROW-6 and DS-ICON-3.
        expect(value('main-installed-single', facts({ rows: [row()], listPaneWidth: 240 }), 'DS-ROW-6@main-installed-single')).toMatchObject({ pass: false, value: 'pane 240: icon 36 (target 24); badges hidden ×0' });
        expect(value('main-installed-single', facts({ rows: [row()], listPaneWidth: 400 }), 'DS-ROW-6@main-installed-single')).toMatchObject({ pass: true });
        expect(value('main-installed-single', facts({ rows: [row({ icon: { left: 46, right: 70, w: 24, h: 24, centre: 136, radius: '2px' } })], listPaneWidth: 250 }), 'DS-ROW-6@main-installed-single')).toMatchObject({ pass: true });
        expect(value('main-installed-single', facts({ rows: [row()] }), 'DS-ICON-3@main-installed-single')).toMatchObject({ pass: true, value: '36×36 (target 36×36)' });
        expect(value('main-installed-single', facts({ rows: [row({ icon: { left: 46, right: 78, w: 32, h: 32, centre: 136, radius: '4px' } })] }), 'DS-ICON-3@main-installed-single'))
            .toMatchObject({ pass: false, value: '32×32 (target 36×36); radius 4px (target 2px)' });
        // UX-P2.3. DS-RADIUS-1 and DS-COLOR-6 on the text buttons.
        const button = (overrides: Record<string, unknown> = {}) => ({ height: 26, fontSize: '12px', lineHeight: '16px', padding: '4px 8px 4px 8px', radius: '4px', disabled: false, opacity: '1', hovered: false, secondary: false, background: 'rgba(0, 0, 0, 0)', ...overrides });
        const withButtons = (buttons: unknown[]) => layout({}, { buttons } as never);
        expect(lineOf('main-installed-single', withButtons([button()]), 'DS-RADIUS-1@main-installed-single')).toMatchObject({ pass: true, status: 'hard', value: 'buttons 4px (target 4px)' });
        expect(lineOf('main-installed-single', withButtons([button({ radius: '2px' })]), 'DS-RADIUS-1@main-installed-single')).toMatchObject({ pass: false });
        expect(lineOf('main-installed-single', withButtons([button({ disabled: true, opacity: '0.4' })]), 'DS-COLOR-6@main-installed-single/text-buttons')).toMatchObject({ pass: true, value: 'disabled 1: opacity 0.4 (target 0.4)' });
        expect(lineOf('main-installed-single', withButtons([button({ disabled: true })]), 'DS-COLOR-6@main-installed-single/text-buttons')).toMatchObject({ pass: false });
        expect(lineOf('main-installed-single', withButtons([]), 'DS-RADIUS-1@main-installed-single')).toMatchObject({ pass: false, value: 'not measurable (no control)' });
        const onlyInputs = (radius: string) => layout({}, { buttons: [], inputs: [{ kind: 'search', id: 'search-input', height: 26, radius }, { kind: 'select', id: 'project-selector', height: 26, radius }, { kind: 'field', id: 'url', height: 25, radius }] } as never);
        expect(lineOf('sidebar-sections', onlyInputs('4px'), 'DS-RADIUS-1@sidebar-sections')).toMatchObject({ pass: true, status: 'hard', value: 'search 4px; select 4px; field 4px (target 4px)' });
        expect(lineOf('sidebar-sections', onlyInputs('2px'), 'DS-RADIUS-1@sidebar-sections')).toMatchObject({ pass: false });
        expect(lineOf('main-installed-single', withButtons([]), 'DS-COLOR-6@main-installed-single/icon-buttons')).toMatchObject({ status: { pending: 'P3.10' }, value: 'not measurable (no disabled icon button)' });
        const gone = layout({}, { iconButtons: [iconButton({ disabled: true, colour: 'rgb(90, 90, 90)' })] });
        expect(lineOf('main-installed-single', gone, 'DS-COLOR-6@main-installed-single/icon-buttons')).toMatchObject({ pass: true, value: 'disabled 1: colour rgb(90, 90, 90) (target disabledForeground)' });
        expect(lineOf('main-installed-single', layout({}, { iconButtons: [iconButton({ disabled: true })] }), 'DS-COLOR-6@main-installed-single/icon-buttons')).toMatchObject({ pass: false });
        expect(lineOf('main-installed-single', withButtons([]), 'DS-COLOR-6@main-installed-single/text-buttons')).toMatchObject({ pass: false, value: 'not measurable (no disabled text button)' });
        expect(lineOf('main-installed-unfocused', withButtons([]), 'DS-COLOR-6@main-installed-unfocused/text-buttons')).toBeUndefined();
        // UX-P2.3b. DS-COLOR-7: a hovered secondary button takes the hover fill, not its rest.
        const hoverLine = (built: Layout) => lineOf('main-installed-toolbar-hover', built, 'DS-COLOR-7@main-installed-toolbar-hover/text-buttons');
        const hoverFacts = (background: string, hovered = true) => ({ ...layout({}, { buttons: [button({ hovered, secondary: true, background })] } as never), endOfP0: { ...layout().endOfP0, buttonSecondary: { hover: 'rgb(43, 43, 43)', rest: 'rgba(0, 0, 0, 0)' } } as Layout['endOfP0'] });
        expect(hoverLine(hoverFacts('rgb(43, 43, 43)'))).toMatchObject({ pass: true, status: 'hard', value: 'hovered secondary rgb(43, 43, 43) (target rgb(43, 43, 43), rest rgba(0, 0, 0, 0))' });
        expect(hoverLine(hoverFacts('rgba(0, 0, 0, 0)'))).toMatchObject({ pass: false });
        expect(hoverLine(hoverFacts('rgb(43, 43, 43)', false))).toMatchObject({ pass: false, value: 'not measurable (no hovered secondary button)' });
        expect(lineOf('main-installed-single', hoverFacts('rgb(43, 43, 43)'), 'DS-COLOR-7@main-installed-single/text-buttons')).toBeUndefined();
        // DS-COLOR-2's check-mark clause and DS-RADIUS-2's check box.
        const withCheck = (check: unknown) => { const built = facts({ rows: [row({ state: 'current', background: 'rgb(4, 57, 94)', listFocused: true, multi: true, radius: '4px', lineWidth: 0, focusPainted: 0, check })] }); return { ...built, heights: { ...built.heights, checkSelect: { fill: '#202020', border: '#cccccc' } } }; };
        expect(value('main-installed-details', withCheck({ fill: 'rgb(32, 32, 32)', border: 'rgb(204, 204, 204)' }), 'DS-COLOR-2@main-installed-details/rows')).toMatchObject({ pass: true, value: expect.stringContaining('check in checkbox.select*') });
        expect(value('main-installed-details', withCheck({ fill: 'rgb(49, 49, 49)', border: 'rgb(204, 204, 204)' }), 'DS-COLOR-2@main-installed-details/rows')).toMatchObject({ pass: false });
        expect(value('main-installed-details', withCheck(undefined), 'DS-COLOR-2@main-installed-details/rows')).toMatchObject({ pass: true });
        const offRow = facts({ rows: [row({ state: 'current', background: 'rgb(4, 57, 94)', listFocused: true, multi: true, radius: '4px', lineWidth: 0, focusPainted: 0, check: undefined, checkOff: true })] });
        expect(value('main-installed-details', offRow, 'DS-COLOR-2@main-installed-details/rows')).toMatchObject({ pass: true, value: expect.stringContaining('check off, not read for checkbox.select*') });
        const radiusFacts = (radius: string) => { const built = facts({ rows: [row({ radius: '4px', lineWidth: 0, focusPainted: 0 })], lookTokens: { '--nuiget-radius-row': '4px' } }); return { ...built, heights: { ...built.heights, checkBoxes: [{ width: 18, height: 18, radius, selected: undefined }] } }; };
        expect(value('main-installed-single', radiusFacts('3px'), 'DS-RADIUS-2@main-installed-single/rows')).toMatchObject({ pass: true, value: expect.stringContaining('check 3px (target 3px)') });
        expect(value('main-installed-single', radiusFacts('2px'), 'DS-RADIUS-2@main-installed-single/rows')).toMatchObject({ pass: false });
        const withActions = (radius: string) => { const built = radiusFacts('3px'); return { ...built, heights: { ...built.heights, iconButtons: [iconButton(), iconButton({ radius })] } }; };
        expect(value('main-installed-single', withActions('4px'), 'DS-RADIUS-2@main-installed-single/rows')).toMatchObject({ pass: true, value: expect.stringContaining('icon-button 4px ×2 (target 4px)') });
        expect(value('main-installed-single', withActions('6px'), 'DS-RADIUS-2@main-installed-single/rows')).toMatchObject({ pass: false });
        // UX-P2.2b. DS-COLOR-2: selection follows the list's focus; a bulk row stays inactive.
        const select = (state: string, background: string, listFocused: boolean, multi = true) => row({ state, background, listFocused, multi, radius: '4px', lineWidth: 0, focusPainted: 0 });
        expect(value('main-installed-details', facts({ rows: [select('current', 'rgb(4, 57, 94)', true)] }), 'DS-COLOR-2@main-installed-details/rows')).toMatchObject({ pass: true, status: 'hard' });
        expect(value('main-details-readme', facts({ rows: [select('current', 'rgb(4, 57, 94)', false)] }), 'DS-COLOR-2@main-details-readme/rows')).toMatchObject({ pass: false });
        expect(value('main-installed-unfocused', facts({ rows: [select('selected', 'rgb(55, 55, 61)', true)] }), 'DS-COLOR-2@main-installed-unfocused/rows')).toMatchObject({ pass: true });
        expect(value('main-installed-details', facts({ rows: [select('selected', 'rgb(4, 57, 94)', true, false)] }), 'DS-COLOR-2@main-installed-details/rows')).toMatchObject({ pass: true });
        expect(value('main-installed-unfocused', facts({ rows: [] }), 'DS-COLOR-2@main-installed-unfocused/rows')).toMatchObject({ pass: false, value: 'not measurable (no selected or current row)' });
        // DS-DIVIDER-1, DS-RADIUS-2, DS-COLOR-5 on the rows.
        const rest = select('rest', 'rgba(0, 0, 0, 0)', false);
        const tokens = { lookTokens: { '--nuiget-radius-row': '4px' } };
        expect(value('main-installed-single', facts({ rows: [rest] }), 'DS-DIVIDER-1@main-installed-single/rows')).toMatchObject({ pass: true, value: '0 of 1 rows with a line' });
        expect(value('main-installed-single', facts({ rows: [{ ...rest, lineWidth: 1 }] }), 'DS-DIVIDER-1@main-installed-single/rows')).toMatchObject({ pass: false });
        expect(value('main-installed-single', facts({ rows: [rest], ...tokens }), 'DS-RADIUS-2@main-installed-single/rows')).toMatchObject({ pass: true });
        expect(value('main-installed-single', facts({ rows: [{ ...rest, radius: '0px' }], ...tokens }), 'DS-RADIUS-2@main-installed-single/rows')).toMatchObject({ pass: false });
        expect(value('main-installed-single', facts({ rows: [{ ...rest, icon: { left: 46, right: 82, w: 36, h: 36, centre: 136, radius: '4px' } }], ...tokens }), 'DS-RADIUS-2@main-installed-single/rows')).toMatchObject({ pass: false });
        expect(value('main-installed-single', facts({ rows: [rest] }), 'DS-COLOR-5@main-installed-single/rows')).toMatchObject({ pass: true });
        expect(value('main-installed-single', facts({ rows: [{ ...rest, focusPainted: 1 }] }), 'DS-COLOR-5@main-installed-single/rows')).toMatchObject({ pass: false });
        // DS-ROW-6 hides the label badges at most 250; DS-ROW-5 fails a clipped one above (UX-P2.2).
        const small = { left: 46, right: 70, w: 24, h: 24, centre: 136, radius: '2px' };
        const clipFacts = (badgesShown: number, badgesClipped: number) => ({ list: 'installed-list', compact: false, name: 'Newtonsoft.Json', nameCut: false, nameEllipsis: true, authorsCut: undefined, versionShown: true, versionCut: false, badgesShown, badgesClipped, actionsEnd: undefined });
        const narrowHidden = { ...facts({ rows: [row({ icon: small })], listPaneWidth: 210 }), rows: [clipFacts(0, 0)] };
        expect(value('main-installed-single', narrowHidden, 'DS-ROW-6@main-installed-single')).toMatchObject({ pass: true, value: 'pane 210: icon 24 (target 24); badges hidden ×1' });
        expect(value('main-installed-single', narrowHidden, 'DS-ROW-5@main-installed-single')).toMatchObject({ pass: true, value: '1 rows, 0 names cut; badges clipped 0' });
        const narrowShown = { ...narrowHidden, rows: [clipFacts(1, 0)] };
        expect(value('main-installed-single', narrowShown, 'DS-ROW-6@main-installed-single')).toMatchObject({ pass: false });
        const wideClipped = { ...facts({ rows: [row()], listPaneWidth: 420 }), rows: [clipFacts(1, 1)] };
        expect(value('main-installed-single', wideClipped, 'DS-ROW-5@main-installed-single')).toMatchObject({ pass: false });
        // DS-ICON-3 follows the list pane: 24 at most 250, hidden at most 200 (UX-P2.2).
        expect(value('main-installed-single', facts({ rows: [row({ icon: { left: 46, right: 70, w: 24, h: 24, centre: 136, radius: '2px' } })], listPaneWidth: 210 }), 'DS-ICON-3@main-installed-single')).toMatchObject({ pass: true, value: '24×24 (target 24×24)' });
        expect(value('main-installed-single', facts({ rows: [row({ icon: undefined })], listPaneWidth: 140 }), 'DS-ICON-3@main-installed-single')).toMatchObject({ pass: true, value: 'hidden (pane ≤ 200)' });
        expect(value('main-installed-single', facts({ rows: [row({ icon: undefined })], listPaneWidth: 400 }), 'DS-ICON-3@main-installed-single')).toMatchObject({ pass: false });
        expect(value('main-installed-single', facts({ rows: [row()], listPaneWidth: 140 }), 'DS-ICON-3@main-installed-single')).toMatchObject({ pass: false, value: '36×36 (target none, pane ≤ 200)' });
        // DS-ROW-1's lines follow each row's list: a Browse row in a details state has three.
        expect(value('main-browse-details', facts({ rows: [row({ list: 'browse-list', lines: 3 })] }), 'DS-ROW-1@main-browse-details')).toMatchObject({ pass: true });
        // A scope with a state list prints nothing in another state; a scope without one follows the rule (UX-P2.2).
        expect(value('main-installed-single', facts({ rows: [row()] }), 'DS-INSET-3@main-installed-single/rows')).toBeUndefined();
        expect(value('main-installed-single', facts({ rows: [row()] }), 'DS-INSET-3@main-installed-single/headers')).toBeDefined();
        // DS-DENSITY-1 per surface.
        expect(lineOf('sidebar-sections', layout({}, { compactRows: [24, 24] }), 'DS-DENSITY-1@sidebar-sections')).toMatchObject({ pass: false, value: 'compact 24 ×2 (target 22)' });
        expect(lineOf('sidebar-sections', layout({}, { compactRows: [22, 22] }), 'DS-DENSITY-1@sidebar-sections')).toMatchObject({ pass: true });
        // DS-OVERFLOW-1, -3, -5.
        expect(value('main-installed-single', facts({ sideways: ['document 1300>1200'] }), 'DS-OVERFLOW-1@main-installed-single')).toMatchObject({ pass: false });
        expect(value('main-installed-single', facts({}), 'DS-OVERFLOW-1@main-installed-single')).toMatchObject({ pass: true, value: 'no sideways scroll' });
        const controls = (out: number, hidden: number, menu: boolean) => [{ container: 'toolbars', label: '[installed-toolbar]', out, hidden, menu, total: 3 }];
        expect(value('main-installed-single', facts({ controlsOut: controls(1, 1, false) }), 'DS-OVERFLOW-3@main-installed-single/toolbars'))
            .toMatchObject({ pass: false, value: '[installed-toolbar] 2/3 reachable, 1 hidden and no menu' });
        // A control hidden behind an overflow menu is reachable.
        expect(value('main-installed-single', facts({ controlsOut: controls(0, 1, true) }), 'DS-OVERFLOW-3@main-installed-single/toolbars'))
            .toMatchObject({ pass: true, value: '[installed-toolbar] 3/3 reachable, 1 hidden behind a menu' });
        expect(value('main-installed-details', facts({ minContent: { toolbar: { scroll: 320, client: 300 }, header: { scroll: 500, client: 600 } } }), 'DS-OVERFLOW-5@main-installed-details'))
            .toMatchObject({ pass: false, value: 'toolbar min-content 320 in 300; header min-content 500 in 600' });
        expect(value('main-installed-details', facts({ minContent: { toolbar: { scroll: 301, client: 301 }, header: { scroll: 600, client: 600 } } }), 'DS-OVERFLOW-5@main-installed-details')).toMatchObject({ pass: true });
        // DS-INSET-4 and DS-ALIGN-1 in the details pane.
        expect(value('main-installed-details', facts({ detailsHeader: { insets: { start: 20, end: 20, top: 20, bottom: 20 }, titleLeft: 620, tabLabelLeft: 620 } }), 'DS-INSET-4@main-installed-details')).toMatchObject({ pass: true, status: { pending: 'P3.3b' } });
        expect(value('main-installed-details', facts({ detailsHeader: { insets: { start: 16, end: 20, top: 20, bottom: 20 }, titleLeft: 620, tabLabelLeft: 620 } }), 'DS-INSET-4@main-installed-details')).toMatchObject({ pass: false });
        expect(value('main-installed-details', facts({ detailsHeader: { insets: { start: 20, end: 20, top: 20, bottom: 20 }, titleLeft: 620, tabLabelLeft: 632 } }), 'DS-INSET-4@main-installed-details')).toMatchObject({ pass: false });
        expect(value('main-installed-details', facts({ factLefts: [[700, 700, 712]] }), 'DS-ALIGN-1@main-installed-details')).toMatchObject({ pass: false, status: { pending: 'P3.3a' } });
        expect(value('main-installed-details', facts({ factLefts: [[700, 700], [640, 640]] }), 'DS-ALIGN-1@main-installed-details')).toMatchObject({ pass: true });
        // UX-P1.1: the font ramp and the two weights, hard; UX-P1.3: the look's tokens, hard.
        const text = (fontSize: number, fontWeight: number, header = false) => ({ fontSize, fontWeight, header });
        expect(value('main-installed-single', facts({ textStyles: [text(13, 600), text(11, 400)] }), 'DS-TYPE-2@main-installed-single')).toMatchObject({ pass: true, status: 'hard' });
        expect(value('main-installed-single', facts({ textStyles: [text(14.95, 600)] }), 'DS-TYPE-2@main-installed-single')).toMatchObject({ pass: false, value: 'off the ramp: 14.95' });
        expect(value('main-installed-single', facts({}), 'DS-TYPE-2@main-installed-single')).toMatchObject({ pass: false, value: expect.stringContaining('not measurable') });
        expect(value('main-installed-single', facts({ textStyles: [text(11, 700, true)] }), 'DS-TYPE-3@main-installed-single')).toMatchObject({ pass: true, status: 'hard' });
        expect(value('main-installed-single', facts({ textStyles: [text(11, 700, true)], dataLook: 'modern' }), 'DS-TYPE-3@main-installed-single')).toMatchObject({ pass: false });
        expect(value('main-installed-single', facts({ textStyles: [text(13, 700)] }), 'DS-TYPE-3@main-installed-single')).toMatchObject({ pass: false });
        expect(value('main-installed-details', facts({ textStyles: [text(13, 700)] }), 'DS-TYPE-3@main-installed-details')).toMatchObject({ pass: false, status: { pending: 'P3.3a' } });
        expect(value('main-installed-single', facts({ lookTokens: { '--nuiget-scrollbar-size': '10px' } }), 'DS-LOOK-1@main-installed-single')).toMatchObject({ pass: false, status: 'hard' });
        // UX-P1.4b: the Verified mark, 12 or 16 px in its role's colour; never a pass without one.
        const mark = (overrides: Record<string, unknown> = {}) => ({ w: 12, h: 12, colour: 'rgb(77, 170, 252)', ...overrides });
        expect(value('main-installed-details', facts({ verifiedMarks: [mark(), mark({ w: 16, h: 16 })], verifiedForeground: '#4daafc' }), 'DS-ICON-4@main-installed-details')).toMatchObject({ pass: true, status: 'hard' });
        expect(value('main-installed-details', facts({ verifiedMarks: [mark({ w: 14, h: 14 })], verifiedForeground: '#4daafc' }), 'DS-ICON-4@main-installed-details')).toMatchObject({ pass: false });
        expect(value('main-installed-details', facts({ verifiedMarks: [mark({ colour: 'rgb(0, 0, 0)' })], verifiedForeground: '#4daafc' }), 'DS-ICON-4@main-installed-details')).toMatchObject({ pass: false });
        expect(value('main-installed-details', facts({}), 'DS-ICON-4@main-installed-details')).toMatchObject({ pass: false, value: expect.stringContaining('not measurable') });
        // The five UX-P0.18 flipped.
        expect(value('main-installed-single', facts({ fonts: { root: 'sans', others: ['monospace'] } }), 'DS-TYPE-1@main-installed-single')).toMatchObject({ pass: false, status: 'hard' });
        expect(value('main-installed-single', facts({ fonts: { root: 'sans', others: [] } }), 'DS-TYPE-1@main-installed-single')).toMatchObject({ pass: true, value: 'one family' });
        expect(value('main-installed-single', facts({ rootLineHeight: 18.2 }), 'DS-TYPE-4@main-installed-single')).toMatchObject({ pass: true });
        expect(value('main-installed-single', facts({ rootLineHeight: 19 }), 'DS-TYPE-4@main-installed-single')).toMatchObject({ pass: false });
        // Compact rows by their computed line-height, within the rule's 0.5.
        expect(value('sidebar-sections', facts({ rootLineHeight: 18.2, compactLineHeights: [22.4, 22] }), 'DS-TYPE-4@sidebar-sections')).toMatchObject({ pass: true });
        expect(value('sidebar-sections', facts({ rootLineHeight: 18.2, compactLineHeights: [18.2] }), 'DS-TYPE-4@sidebar-sections'))
            .toMatchObject({ pass: false, value: 'line height 18.2 (target 18.2); compact rows 18.2 (target 22)' });
        const meta = (fontSize: number, colour = 'rgb(157, 157, 157)') => [{ kind: 'meta', fontSize, colour, selected: false }];
        expect(value('main-installed-single', facts({ metaText: meta(11), descriptionForeground: '#9d9d9d' }), 'DS-TYPE-6@main-installed-single')).toMatchObject({ pass: true });
        expect(value('main-installed-single', facts({ metaText: meta(11.5), descriptionForeground: '#9d9d9d' }), 'DS-TYPE-6@main-installed-single')).toMatchObject({ pass: false });
        // The computed 11.05 of the run is within the rule's own 0.1.
        expect(value('main-installed-single', facts({ metaText: meta(11.05), descriptionForeground: '#9d9d9d' }), 'DS-TYPE-6@main-installed-single')).toMatchObject({ pass: true, status: 'hard' });
        expect(value('main-browse-details', facts({ metaText: [...meta(11), { kind: 'description', fontSize: 11.05, colour: 'rgb(157, 157, 157)', selected: false }], descriptionForeground: '#9d9d9d' }), 'DS-TYPE-6@main-browse-details'))
            .toMatchObject({ pass: false, status: { pending: 'P3.2' } });
        expect(value('main-installed-unsupported', facts({ copyEnds: [{ kind: 'banner', text: 'Unsupported project: requires .NET SDK 10 or newer' }] }), 'DS-COPY-3@main-installed-unsupported'))
            .toMatchObject({ pass: false, status: { pending: 'P2.8b' } });
        expect(value('main-installed-single', facts({ metaText: meta(11, 'rgb(204, 204, 204)'), descriptionForeground: '#9d9d9d' }), 'DS-TYPE-6@main-installed-single'))
            .toMatchObject({ pass: false, value: 'meta 11 (target 11); 1 meta off descriptionForeground' });
        expect(value('main-installed-hover', facts({ rows: [row({ actions: 4 })] }), 'DS-ROW-4@main-installed-hover')).toMatchObject({ pass: false });
        expect(value('main-installed-hover', facts({ rows: [row({ actions: 3 })] }), 'DS-ROW-4@main-installed-hover')).toMatchObject({ pass: true });
        expect(value('main-installed-empty', facts({ copyEnds: [{ kind: 'empty', text: 'No packages installed' }] }), 'DS-COPY-3@main-installed-empty')).toMatchObject({ pass: false, value: 'no full stop: empty "No packages installed"' });
        expect(value('main-installed-empty', facts({ copyEnds: [{ kind: 'empty', text: 'No packages installed.' }] }), 'DS-COPY-3@main-installed-empty')).toMatchObject({ pass: true });
        expect(value('main-installed-single', facts({}), 'DS-COPY-3@main-installed-single')).toBeUndefined();
    });

    it('checks the rules registered with the theme dump: focus rings and disabled reasons (UX-P0.14)', () => {
        const colours = { focusBorder: '#0078d4', listFocusOutline: '#0078d4', contrastActiveBorder: '#f38518' };
        const ring = (width: number, style: string, colour: string, offset: number) => ({ width, style, colour, offset });
        const box = { left: 10, top: 100, right: 410, bottom: 172 };
        const focused = (kind: string, outline: ReturnType<typeof ring>, extra: Record<string, unknown> = {}) => ({ kind, label: '[x]', outline, variant: '', box, band: undefined, ...extra });
        const facts = (overrides: Record<string, unknown>) => layout({ endOfP0: { ...layout().endOfP0, fonts: { root: 'sans', others: [] }, focusColours: colours, ...overrides } as Layout['endOfP0'] });
        const at = (state: string, built: Layout, name: string, look: 'modern' | 'classic' = 'modern', theme = 'dark-modern') =>
            measureLines(state, built, look, {}, undefined, 1200, undefined, theme).find(line => line.name === name);
        const blue = 'rgb(0, 120, 212)';
        const orange = 'rgb(243, 133, 24)';
        // DS-FOCUS-1: 1 px solid focusBorder, offset -1 on inputs and tabs, +2 on text buttons; a focused row is not its subject.
        expect(at('main-installed-unfocused', facts({ focus: focused('input', ring(1, 'solid', blue, -1)) }), 'DS-FOCUS-1@main-installed-unfocused/controls')).toMatchObject({ pass: true, status: 'hard' });
        expect(at('main-installed-unfocused', facts({ focus: focused('button', ring(1, 'solid', blue, -1)) }), 'DS-FOCUS-1@main-installed-unfocused/controls'))
            .toMatchObject({ pass: false, value: 'button [x]: outline 1 solid rgb(0, 120, 212) offset -1 (target 1 solid #0078d4 offset 2)' });
        expect(at('main-updates', facts({ focus: focused('tab', ring(1, 'solid', blue, -1)) }), 'DS-FOCUS-1@main-updates/tabs')).toMatchObject({ pass: true, status: 'hard' });
        expect(at('main-installed-single', facts({ focus: focused('tab', ring(1, 'solid', blue, -1)) }), 'DS-FOCUS-1@main-installed-single/tabs')).toMatchObject({ status: 'hard' });
        expect(at('main-installed-details', facts({ focus: focused('tab', ring(1, 'solid', blue, -1)) }), 'DS-FOCUS-1@main-installed-details/tabs')).toBeUndefined();
        expect(at('main-updates', facts({ focus: focused('tab', ring(2, 'solid', blue, -1)) }), 'DS-FOCUS-1@main-updates/tabs')).toMatchObject({ pass: false });
        expect(at('main-installed-focus', facts({ focus: focused('option', ring(1, 'solid', blue, -1)) }), 'DS-FOCUS-1@main-installed-focus/controls')).toBeUndefined();
        expect(at('main-installed-filter', facts({ focus: focused('option', ring(1, 'solid', blue, -1)) }), 'DS-FOCUS-1@main-installed-filter/controls')).toMatchObject({ pass: false, value: 'not measurable (no focused control)' });
        expect(at('main-installed-filter', facts({ focus: focused('icon-button', ring(1, 'solid', blue, 2)) }), 'DS-FOCUS-1@main-installed-filter/controls'))
            .toMatchObject({ pass: false, value: 'not measurable (icon button [x]: DS-FOCUS-1 names no offset for it)' });
        // DS-FOCUS-2: list.focusOutline around the whole band.
        const band = { left: 10, top: 100, right: 410, bottom: 172 };
        expect(at('main-installed-focus', facts({ focus: focused('option', ring(1, 'solid', blue, -1), { band }) }), 'DS-FOCUS-2@main-installed-focus/rows'))
            .toMatchObject({ pass: true, value: '[x]: outline 1 solid rgb(0, 120, 212) offset -1 (target 1 solid #0078d4 offset -1); ring 0 from the band', status: 'hard' });
        expect(at('main-installed-focus', facts({ focus: focused('option', ring(1, 'solid', blue, -1), { band: { ...band, left: 6 } }) }), 'DS-FOCUS-2@main-installed-focus/rows')).toMatchObject({ pass: false });
        expect(at('main-installed-focus', facts({ focus: focused('option', ring(3, 'none', blue, 0), { band }) }), 'DS-FOCUS-2@main-installed-focus/rows')).toMatchObject({ pass: false });
        // DS-FOCUS-3: a ring after a click on a row or a tab, in the states whose setup clicked one.
        expect(at('main-installed-details', facts({ focus: focused('option', ring(1, 'solid', blue, -1)) }), 'DS-FOCUS-3@main-installed-details/rows')).toMatchObject({ pass: true });
        expect(at('main-installed-details', facts({ focus: focused('option', ring(3, 'none', blue, 0)) }), 'DS-FOCUS-3@main-installed-details/rows'))
            .toMatchObject({ pass: false, value: '[x] after a click: no ring (target a ring, main panel, modern)' });
        expect(at('main-installed-single', facts({ focus: focused('option', ring(1, 'solid', blue, -1)) }), 'DS-FOCUS-3@main-installed-single/rows')).toBeUndefined();
        // DS-FOCUS-4: high contrast only; the selected row dotted, the focused row solid, in contrastActiveBorder.
        const row = (state: string, outline: ReturnType<typeof ring>, isFocused = false) => ({ list: 'installed-list', compact: false, band, painted: undefined, state, icon: undefined, nameLeft: undefined, textCentre: undefined, lines: 2, actions: 0, outline, focused: isFocused });
        const hc = facts({ rows: [row('current', ring(1, 'dotted', orange, -1)), row('focus', ring(1, 'solid', orange, -1), true)] });
        expect(at('main-installed-details', hc, 'DS-FOCUS-4@main-installed-details/rows', 'modern', 'dark-high-contrast')).toMatchObject({ pass: true, status: 'hard' });
        expect(at('main-installed-details', hc, 'DS-FOCUS-4@main-installed-details/rows')).toBeUndefined();
        expect(at('main-installed-details', facts({ rows: [row('current', ring(0, 'none', orange, 0))] }), 'DS-FOCUS-4@main-installed-details/rows', 'modern', 'dark-high-contrast'))
            .toMatchObject({ pass: false, value: 'selected 0 none rgb(243, 133, 24) (target 1 dotted #f38518); focused none (target 1 solid); hovered not measurable (no high-contrast hover state)' });
        // DS-STATE-7: every disabled affordance says why.
        expect(at('main-installed-single', facts({ disabled: [{ label: '[uninstall-selected-button]', reason: 'Select packages first.' }] }), 'DS-STATE-7@main-installed-single')).toMatchObject({ pass: true, status: { pending: 'P2.8a' } });
        expect(at('main-installed-single', facts({ disabled: [{ label: '[uninstall-selected-button]', reason: '' }, { label: '.nuiget-row-option', reason: 'Implicitly referenced by an SDK.' }] }), 'DS-STATE-7@main-installed-single'))
            .toMatchObject({ pass: false, value: '2 disabled, 1 without a reason: [uninstall-selected-button]' });
        expect(at('main-installed-details', facts({}), 'DS-STATE-7@main-installed-details')).toMatchObject({ pass: false, value: 'not measurable (no disabled affordance)', status: { pending: 'P3.3b' } });
    });

    it('compares a state\'s elements with its artboard spec within 1 px at the spec\'s width (helper 8, UX-P0.13)', () => {
        const element = (x: number, y: number, w: number, h: number, padding = '0px 0px 0px 0px'): SpecElement => ({ rect: { x, y, w, h }, inset: x, padding, gap: 'normal normal' });
        const spec: SpecLook = { 'tab-bar': { ...element(0, 40, 932, 35), tokens: ['--nuiget-inset'] }, 'installed-list': element(0, 110, 932, 693), 'package-row-serilog#2': element(0, 182, 932, 72, '0px 16px 0px 16px') };
        const at = (testIds: Record<string, SpecElement>, given: SpecLook | undefined, width = 932) =>
            measureLines('main-installed-single', layout({ testIds }), 'modern', {}, undefined, width, given).find(line => line.name === 'SPEC@main-installed-single');
        // Every element within 1 px, tokens not compared: pending on the screen item.
        expect(at({ 'tab-bar': element(0.5, 40, 932, 35), 'installed-list': element(0, 110, 932, 693.8), 'package-row-serilog#2': element(0, 182, 932, 72, '0px 16px 0px 16px') }, spec))
            .toMatchObject({ pass: true, status: { pending: 'P2.8a' }, value: '3/3 within 1' });
        // A missing id, a rect 2 px off and a padding off are each named.
        expect(at({ 'tab-bar': element(0, 40, 932, 35), 'installed-list': element(0, 110, 932, 683), 'package-row-serilog#2': element(0, 182, 932, 72) }, spec)).toMatchObject({
            pass: false, value: '2/3 within 1; off: installed-list Δh -10; style: package-row-serilog#2 padding 0px 0px 0px 0px (spec 0px 16px 0px 16px)',
        });
        expect(at({ 'tab-bar': element(2, 40, 932, 35) }, spec)).toMatchObject({ pass: false, value: '0/3 within 1; missing: installed-list, package-row-serilog#2; off: tab-bar Δx 2 Δinset 2' });
        // A capture without a spec for its theme and width is never a pass; another width does not apply.
        expect(at({}, undefined)).toMatchObject({ pass: false, value: "not measurable (no artboard spec for this capture's theme and width)" });
        expect(at({}, spec, 800)).toBeUndefined();
    });

    it('holds DS-SCROLL-1 to the look\'s bar thickness in every scrolling list and the root\'s scrollbar-color reset (UX-P0.22)', () => {
        const scroller = (label: string, size: number) => ({ label, left: 0, top: 0, width: 300, height: 200, right: 300, size, thumb: 50, backdrop: 'rgb(30, 30, 30)' });
        const bars = (rootColor: string, ...scrollers: Array<ReturnType<typeof scroller>>) => layout({ scrollbar: { rootColor, slider: '#79797966', scrollers } });
        const name = 'DS-SCROLL-1@main-installed-all';
        expect(lineOf('main-installed-all', bars('auto', scroller('[installed-list]', 10)), name, 'classic')).toMatchObject({
            value: '[installed-list] 10 (target 10); :root scrollbar-color auto; slider #79797966', status: { pending: 'P3.9' }, pass: true,
        });
        // Modern UI's 8 px is a look token (P1.1): 10 px reads red there until then.
        expect(lineOf('main-installed-all', bars('auto', scroller('[installed-list]', 10)), name, 'modern')).toMatchObject({ pass: false });
        // The host's colour pair switches the WebKit rules off (V15), whatever the thickness reads.
        expect(lineOf('main-installed-all', bars('rgba(121, 121, 121, 0.4) rgb(30, 30, 30)', scroller('[installed-list]', 10)), name, 'classic')).toMatchObject({ pass: false });
        expect(lineOf('main-installed-all', bars('auto', scroller('[installed-list]', 10), scroller('.nuiget-details', 15)), name, 'classic')).toMatchObject({ pass: false });
        expect(lineOf('main-installed-all', bars('auto'), name, 'classic')).toMatchObject({ value: 'not measurable (no scrolling list)', pass: false });
        // The `[probe] scrollbar` verdict: the slider's alpha over the backdrop, each channel within 2 of the thumb's pixel.
        expect(thumbVerdict('#79797966', 'rgb(30, 30, 30)', [66, 66, 66])).toEqual({ expected: 'rgb(66, 66, 66)', match: true });
        expect(thumbVerdict('rgba(121, 121, 121, 0.4)', 'rgb(30, 30, 30)', [68, 64, 66])).toEqual({ expected: 'rgb(66, 66, 66)', match: true });
        expect(thumbVerdict('rgba(121, 121, 121, 0.4)', 'rgb(30, 30, 30)', [70, 66, 66])).toMatchObject({ match: false });
        expect(thumbVerdict('rgb(10, 20, 30)', 'rgb(250, 250, 250)', [10, 20, 30])).toEqual({ expected: 'rgb(10, 20, 30)', match: true });
        expect(thumbVerdict('var(--vscode-scrollbarSlider-background)', 'rgb(30, 30, 30)', [66, 66, 66])).toEqual({ expected: undefined, match: false });
        expect(thumbVerdict('#79797966', '', [66, 66, 66])).toEqual({ expected: undefined, match: false });
    });

    it('reads theme colours in hex and computed colours alike', () => {
        expect(parseColour('#0078d4')).toEqual([0, 120, 212, 1]);
        expect(parseColour('#0078d480')).toEqual([0, 120, 212, 0.5]);
        expect(parseColour('#fff')).toEqual([255, 255, 255, 1]);
        expect(parseColour('rgba(0, 120, 212, 0.5)')).toEqual([0, 120, 212, 0.5]);
        expect(parseColour('rgb(0 120 212)')).toEqual([0, 120, 212, 1]);
        expect(parseColour('transparent')).toBeUndefined();
    });

    it('ships in-page scripts that parse as script bodies, and a selector for every workbench control', () => {
        expect(() => new Function(COLLECT_LAYOUT)).not.toThrow();
        expect(() => new Function(MEASURE_WIDGETS)).not.toThrow();
        expect(Object.keys(WORKBENCH_WIDGETS)).toEqual(['extensionsRow', 'extensionsSearch', 'paneHeader', 'extensionNavbar', 'settingsSelect', 'settingsInput', 'settingsButton', 'editorTabs', 'quickInputBox', 'quickInputRow']);
        expect(Object.values(WORKBENCH_WIDGETS).every(selectors => selectors.length > 0)).toBe(true);
    });

    it('holds the icon glyph, the tab roles and the strip to the workbench (UX-P2.5)', () => {
        const icons = (...buttons: Array<Partial<Heights['iconButtons'][number]>>) => layout({}, { iconButtons: buttons.map(iconButton) });
        const icon2 = (built: Layout) => lineOf('main-installed-details', built, 'DS-ICON-2@main-installed-details');
        expect(icon2(icons({}, {}))).toMatchObject({ pass: true, status: 'hard', value: 'glyph 16×16 ×2 (target 16×16); colour icon.foreground ×2' });
        const current = { band: 'current', listFocused: true } as const;
        expect(icon2(icons({}, { ...current, colour: 'rgb(255, 255, 255)' }))).toMatchObject({ pass: true, value: 'glyph 16×16 ×2 (target 16×16); colour icon.foreground, current row list.activeSelectionIconForeground' });
        expect(icon2(icons(current))).toMatchObject({ pass: false, value: expect.stringContaining('off: refresh-button rgb(204, 204, 204) (expected current row list.activeSelectionIconForeground)') });
        // Without list focus the band is quiet and a multi-selectable list's selected band keeps icon.foreground.
        expect(icon2(icons({ band: 'current' }, { band: 'selected', listFocused: true, multi: true }))).toMatchObject({ pass: true });
        expect(icon2(icons({ disabled: true, colour: 'rgb(90, 90, 90)' }))).toMatchObject({ pass: true });
        expect(icon2(icons({ glyph: { w: 14, h: 14 } }))).toMatchObject({ pass: false });
        expect(icon2(icons({ severity: true, colour: 'rgb(204, 167, 0)' }))).toMatchObject({ pass: true, value: expect.stringContaining('severity problemsWarningIcon.foreground') });
        expect(icon2(icons({ severity: true }))).toMatchObject({ pass: false });
        expect(icon2(layout())).toMatchObject({ pass: false, value: 'not measurable (no icon button)' });

        const selected = { id: 'installed-tab', selected: true, colour: 'rgb(231, 231, 231)', lineWidth: 1, lineColour: 'rgb(0, 120, 212)' };
        const other = { id: 'updates-tab', selected: false, colour: 'rgb(157, 157, 157)', lineWidth: 1, lineColour: 'rgba(0, 0, 0, 0)' };
        const tabs = (...list: Array<typeof selected>) => layout({}, { tabs: list });
        const color4 = (built: Layout) => lineOf('main-installed-single', built, 'DS-COLOR-4@main-installed-single/tabs');
        expect(color4(tabs(selected, other))).toMatchObject({ pass: true, status: 'hard', value: 'selected [installed-tab]: panelTitle.activeForeground, line 1 panelTitle.activeBorder; 1 other: panelTitle.inactiveForeground, no line' });
        expect(color4(tabs({ ...selected, lineWidth: 2 }, other))).toMatchObject({ pass: false });
        expect(color4(tabs(selected, { ...other, colour: selected.colour }))).toMatchObject({ pass: false });
        expect(color4(layout())).toMatchObject({ pass: false, value: 'not measurable (no tab)' });
        const color5 = (built: Layout) => lineOf('main-installed-single', built, 'DS-COLOR-5@main-installed-single/tabs');
        expect(color5(tabs(selected, other))).toMatchObject({ pass: true, status: 'hard', value: 'tabs: selected line in panelTitle.activeBorder; 1 others unlined' });
        expect(color5(tabs(selected, { ...other, lineColour: selected.lineColour }))).toMatchObject({ pass: false });
        expect(color5(tabs({ ...selected, lineColour: 'rgb(1, 1, 1)' }, other))).toMatchObject({ pass: false });

        // UX-P2.5b. DS-COLOR-3: a hovered icon button takes the toolbar's hover fill, not its rest.
        const hover3 = (built: Layout) => lineOf('main-installed-refresh-hover', built, 'DS-COLOR-3@main-installed-refresh-hover/icon-buttons');
        expect(hover3(icons({ hovered: true, background: 'rgba(90, 93, 94, 0.31)' }))).toMatchObject({ pass: true, status: 'hard', value: 'hovered [refresh-button] rgba(90, 93, 94, 0.31) (target rgba(90, 93, 94, 0.31), rest rgba(0, 0, 0, 0))' });
        expect(hover3(icons({ hovered: true }))).toMatchObject({ pass: false });
        expect(hover3(icons({}))).toMatchObject({ pass: false, value: 'not measurable (no hovered icon button)' });
        expect(lineOf('main-installed-single', icons({ hovered: true }), 'DS-COLOR-3@main-installed-single/icon-buttons')).toBeUndefined();
        const strip = layout({}, { tabStrip: 36 });
        expect(lineOf('main-installed-single', strip, 'DS-HEIGHT-4@main-installed-single', 'modern', { extensionNavbar: 37 })).toMatchObject({ pass: true, status: 'hard', value: '36 (target 36, workbench 37)' });
        expect(lineOf('main-browse-results', strip, 'DS-HEIGHT-4@main-browse-results')).toBeUndefined();
        // The Browse view takes the strip's place in a details state; a strip gone without it is still red.
        for (const name of ['DS-HEIGHT-4@main-browse-details', 'DS-OVERFLOW-3@main-browse-details/tabs']) {
            expect(lineOf('main-browse-details', layout({ browsing: true }), name)).toMatchObject({ pass: true, status: 'hard', value: 'tab strip not shown (browsing)' });
            expect(lineOf('main-browse-details', layout(), name)).toMatchObject({ pass: false });
        }
        expect(measureLines('main-installed-single', layout(), 'modern', {}, undefined, 220).find(line => line.name === 'PF-6@main-installed-single')).toMatchObject({ status: { pending: 'P2.7' } });
        expect(measureLines('main-installed-single', layout(), 'modern', {}, undefined, 400).find(line => line.name === 'PF-6@main-installed-single')).toMatchObject({ status: { pending: 'P2.7' } });
        expect(measureLines('main-installed-single', layout(), 'modern', {}, undefined, 600).find(line => line.name === 'PF-6@main-installed-single')).toMatchObject({ status: 'hard' });
        const hits = layout({}, { iconButtons: [iconButton(), iconButton({ inHeader: true, width: 20, height: 20 })] });
        expect(lineOf('sidebar-sections', hits, 'DS-HEIGHT-8@sidebar-sections')).toMatchObject({ pass: true, status: 'hard', value: 'painted 22×22 (target 22×22); section header 20×20 (target 20×20); hit 24 ×2 (at least 24)' });
        expect(measureLines('main-installed-single', layout(), 'modern', {}, undefined, 400).find(line => line.name === 'DS-OVERFLOW-3@main-installed-single/toolbars')).toMatchObject({ status: { pending: 'P2.7' } });
    });
});
