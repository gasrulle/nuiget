import { describe, expect, it } from 'vitest';
import { appliesTo, cellList, type ChromeReference, COLLECT_LAYOUT, ROW_LEFTS_REFERENCE, rowLeftsOf, elementGroups, formatLine, type Heights, type Layout, MEASURE_WIDGETS, measureLines, outerScrollVerdict, parseColour, RAMP, RULES, type Scope, type SpecElement, type SpecLook, stateGroup, thumbVerdict, TOLERANCES, WORKBENCH_WIDGETS } from '../ui/v2/measure';
import { STATES } from '../ui/v2/states';

/**
 * UX-P0.10 and UX-P0.11: the measurement registry of `src/test/ui/v2/measure.ts`. The rules run only in the UI job
 * (inside VS Code); this test holds their statuses, the line format and the verdicts on hand-built layouts on every push.
 */
const noHeights: Heights = {
    headers: [], compactRows: [], comfortableRows: [], comfortablePitches: [], tabStrip: undefined, detailsTabs: undefined, buttons: [], inputs: [],
    iconButtons: [], toggles: [], tabs: [], checkBoxes: [], checkSelect: { fill: '', border: '' }, badges: [], progress: [],
};

const layout = (overrides: Partial<Layout> = {}, heights: Partial<Heights> = {}): Layout => ({
    root: true, height: 803, examined: 0, offRamp: [], offRampCount: 0, blockGaps: [], sections: [], toolbars: [], mainHeader: undefined,
    sidebarHeader: undefined, mainLefts: {}, mainRegionLeft: undefined, details: undefined, sidebar: undefined,
    centring: [], detailsButtons: { uninstall: undefined, update: undefined }, width: 1200, rows: [], chrome: {}, firstRow: undefined,
    overflow: { containers: 0, collisions: [], outside: [], clipped: [], count: 0, badges: [] }, transitiveGap: undefined, primaryEdges: [],
    browsing: false, flatList: false, documentOverflow: undefined,
    endOfP0: {
        rows: [], listSelection: { active: 'rgb(4, 57, 94)', inactive: 'rgb(55, 55, 61)' }, focusCoincides: [], buttonSecondary: { hover: '', rest: '' }, iconColours: { icon: 'rgb(204, 204, 204)', active: 'rgb(255, 255, 255)', disabled: 'rgb(90, 90, 90)', warning: 'rgb(204, 167, 0)', hoverBg: 'rgba(90, 93, 94, 0.31)' }, tabColours: { active: 'rgb(231, 231, 231)', inactive: 'rgb(157, 157, 157)', indicator: 'rgb(0, 120, 212)' }, actionRadius: '4px', contrastBorder: '', uppercaseHeaders: false, titles: { panel: undefined, details: undefined, dialog: undefined }, headings: [], dividers: { key: '', header: undefined, tabStrips: [], groupLines: [] }, listPaneWidth: undefined, detailsHeader: undefined, sideways: [], controlsOut: [], minContent: { toolbar: undefined, header: undefined },
        factLefts: [], fonts: { root: '', others: [] }, textStyles: [], readmeHeadings: [], verifiedMarks: [], verifiedForeground: '', dataLook: undefined, lookTokens: {}, rootLineHeight: undefined, compactLineHeights: [], metaText: [], descriptionForeground: '', copyEnds: [], detailsLabels: [], detailsEmpty: undefined, split: undefined,
        focus: undefined, focusColours: { focusBorder: '', listFocusOutline: '', contrastActiveBorder: '' }, disabled: [], unselectable: [],
        stateCells: { testIds: [], rows: 0, disabledVersions: [], skeletonRows: 0, listBusy: false, progressTop: undefined, contentTop: undefined, empties: [], banners: [], roles: [] },
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

const asGrid1 = { 'main-updates': 'hard', browse: 'hard', details: 'hard', dialogs: 'hard', sources: 'hard', sidebar: { pending: 'P3.7a' } };

/** Every named state and a loading state of each group no item names yet (DS-HEIGHT-11's later scopes). */
const CANDIDATES = [...STATES.map(state => state.name), 'main-sources-list', 'main-updates-loading', 'main-browse-loading', 'main-loading-details', 'sidebar-loading', 'main-updates-empty', 'main-browse-empty', 'main-empty-details', 'sidebar-empty', 'main-updates-error', 'main-browse-error', 'main-error-details', 'sidebar-error'];

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
            'DS-INSET-4', 'DS-ROW-1', 'DS-ROW-2', 'DS-ROW-3', 'DS-RADIUS-1', 'DS-COLOR-6', 'DS-ICON-2', 'DS-COLOR-4', 'DS-TYPE-5', 'DS-COPY-5', 'DS-COPY-2', 'DS-TYPE-7', 'DS-TYPE-9', 'DS-DIVIDER-4', 'DS-TYPE-8', 'DS-HC-1', 'DS-COLOR-7', 'DS-COLOR-3', 'DS-COLOR-2', 'DS-DIVIDER-1', 'DS-RADIUS-2', 'DS-DIVIDER-2', 'DS-DIVIDER-5', 'DS-DIVIDER-3', 'DS-COLOR-5', 'DS-ROW-6', 'DS-ICON-3', 'DS-DENSITY-1', 'DS-OVERFLOW-1', 'DS-OVERFLOW-3', 'DS-OVERFLOW-5', 'DS-ALIGN-1',
            'DS-TYPE-1', 'DS-TYPE-4', 'DS-TYPE-6', 'DS-ROW-4', 'DS-COPY-3', 'SPEC',
            'DS-FOCUS-1', 'DS-FOCUS-2', 'DS-FOCUS-3', 'DS-FOCUS-4', 'DS-STATE-7', 'DS-STATE-1', 'DS-STATE-2', 'DS-STATE-3', 'DS-STATE-4', 'DS-COLOR-1', 'DS-SCROLL-1',
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
        // UX-P3.5: no dialog state; a pointer-opened dialog shows no ring under Modern UI (DS-FOCUS-3, design-advisor follow-up 2).
        // UX-P3.6: the add form's focused field joined after its reading run (run 42420897265: 1 solid focusBorder offset -1).
        expect(definition('DS-FOCUS-1')?.pendingStates).toBeUndefined();
        expect(definition('DS-FOCUS-1')?.scopeStates).toEqual({ controls: ['main-browse-results', 'main-installed-filter', 'main-installed-filter-nomatch', 'main-installed-unfocused', 'main-quicksearch-open', 'main-quicksearch-versions', 'main-sources-add'], tabs: ['main-installed-error', 'main-installed-unresolved', 'main-installed-single', 'main-installed-all', 'main-installed-cpm', 'main-installed-hover', 'main-installed-toolbar-hover', 'main-installed-unsupported', 'main-updates', 'main-details-readme'] });
        // UX-P3.5: the dialog scopes only where they can measure (design-advisor ruling of 2026-11-07, DO 6).
        const dialogStates = ['main-installed-bulk-dialog', 'sidebar-update-all-dialog', 'main-browse-multi-install-dialog', 'main-sources-remove-dialog'];
        expect(definition('DS-HEIGHT-9')?.scopeStates).toEqual({ dialogs: ['main-browse-multi-install-dialog'], sources: ['main-sources', 'main-sources-revalidating', 'main-sources-error', 'main-sources-add-invalid'] });
        expect(definition('DS-INSET-2')?.scopeStates).toEqual({ dialogs: dialogStates });
        expect(definition('DS-RADIUS-2')?.scopeStates).toMatchObject({ layers: dialogStates });
        expect(definition('DS-DIVIDER-2')?.states).toEqual(dialogStates);
        expect(definition('DS-DIVIDER-5')?.states).toEqual(dialogStates);
        expect(definition('DS-INSET-3')?.scopeStates).toEqual({ rows: ['main-installed-hover', 'main-installed-focus', 'main-installed-details'] });
        expect(definition('DS-ROW-3')?.scopeStates).toEqual({ 'main-installed': ['main-installed-hover', 'main-installed-focus', 'main-installed-unfocused'], details: ['main-installed-details', 'main-details-readme', 'main-transitive-details', 'main-browse-details'], 'main-updates': ['main-updates-hover'], browse: ['main-browse-hover'] });
        expect(definition('DS-FOCUS-2')?.states).toEqual(['main-installed-focus', 'main-installed-details', 'main-transitive-details', 'main-browse-details', 'main-transitive-expanded']);
        expect(definition('DS-FOCUS-2')?.pendingStates).toBeUndefined();
        expect(definition('DS-FOCUS-3')?.scopeStates).toEqual({ rows: ['main-installed-details'], tabs: ['main-updates'] });
        expect(definition('DS-FOCUS-4')?.states).toEqual(['main-installed-details', 'main-installed-focus']);
        expect(scopes('DS-GRID-1')).toEqual({ 'main-installed': 'hard', ...asGrid1 });
        expect(scopes('DS-GRID-2a')).toEqual({ 'main-installed': 'hard', ...asGrid1 });
        // UX-P3.2: no browse scope for DS-GRID-2b (a flat list and a popup have no group header; design-advisor ruling); UX-P3.5: nor dialogs.
        const grid2b = Object.fromEntries(Object.entries(asGrid1).filter(([scope]) => scope !== 'browse' && scope !== 'dialogs' && scope !== 'sources'));
        expect(scopes('DS-GRID-2b')).toEqual({ 'main-installed': 'hard', ...grid2b });
        expect(scopes('DS-INSET-1')).toEqual({ 'main-installed': 'hard', details: 'hard', sidebar: { pending: 'P3.7a' } });
        expect(scopes('DS-INSET-2')).toEqual({ toolbars: 'hard', headers: 'hard', 'main-header': 'hard', dialogs: 'hard', sidebar: { pending: 'P3.7a' } });
        // UX-P0.11: PF-3b and PF-5 hard where P9.fix-3 and P9.fix-5 measured; the heights pending on Appendix B's items.
        const mainHard = () => ({ 'main-installed': 'hard', 'main-updates': 'hard', browse: 'hard', details: 'hard' });
        expect(scopes('PF-3b')).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard' });
        expect(RULES.find(rule => rule.id === 'PF-3b')?.states).toEqual(['main-installed-single', 'main-updates']);
        expect(scopes('PF-5')).toEqual({ details: 'hard' });
        expect(RULES.find(rule => rule.id === 'PF-5')?.states).toEqual(['main-installed-details']);
        // The tracker's state group for DS-HEIGHT-1 and -2 is the sidebar.
        expect(scopes('DS-HEIGHT-1')).toEqual({ sidebar: { pending: 'P3.7a' } });
        expect(scopes('DS-HEIGHT-2')).toEqual({ sidebar: { pending: 'P3.7a' }, popup: { pending: 'P3.7a' } });
        expect(scopes('DS-RADIUS-2')).toEqual({ rows: 'hard', popup: 'hard', layers: 'hard' });
        // UX-P3.5 (design-advisor ruling of 2026-11-07): the dialog layer's elevation and backdrop, hard in the three dialog states.
        expect(scopes('DS-DIVIDER-2')).toEqual({ layers: 'hard' });
        expect(scopes('DS-DIVIDER-5')).toEqual({ dialogs: 'hard' });
        expect(scopes('DS-DIVIDER-3')).toEqual({ browse: 'hard' });
        expect(scopes('DS-HEIGHT-3')).toEqual(mainHard());
        expect(scopes('DS-HEIGHT-4')).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard', details: 'hard' });
        expect(scopes('DS-HEIGHT-5')).toEqual({ details: 'hard' });
        expect(scopes('DS-HEIGHT-6')).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard', details: 'hard', dialogs: 'hard', sources: 'hard' });
        // UX-P3.6: no dialog state renders a field; the add form is a sources state.
        expect(scopes('DS-HEIGHT-7')).toEqual({ ...mainHard(), sidebar: 'hard', sources: 'hard' });
        expect(definition('DS-HEIGHT-7')?.scopeStates).toEqual({ sources: ['main-sources-add', 'main-sources-add-invalid'] });
        expect(scopes('DS-HEIGHT-8')).toEqual({ ...mainHard(), sidebar: 'hard', sources: 'hard' });
        expect(scopes('DS-HEIGHT-9')).toEqual({ ...mainHard(), dialogs: 'hard', sources: 'hard' });
        expect(scopes('DS-RADIUS-1')).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard', details: 'hard', dialogs: 'hard', browse: 'hard', sidebar: 'hard', sources: 'hard' });
        expect(scopes('DS-COLOR-6')).toEqual({ 'text-buttons': 'hard', 'icon-buttons': { pending: 'P3.10' } });
        expect(scopes('DS-HEIGHT-10')).toEqual({ ...mainHard(), sidebar: 'hard' });
        // A popup cell has no bar: its marker is DS-STATE-1's (UX-P3.2).
        expect(RULES.find(rule => rule.id === 'DS-HEIGHT-11')?.exceptStates).toEqual(['main-quicksearch-loading', 'main-quicksearch-error']);
        expect(scopes('DS-HEIGHT-11')).toEqual({ 'main-installed': 'hard', 'main-updates': { pending: 'P3.10' }, browse: { pending: 'P3.10' }, details: { pending: 'P3.10' }, sidebar: { pending: 'P3.10' } });
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
        // UX-P2.fix-3: SPEC reads the artboard the `ui` lane renders; no other lane has a reference, so it measures there alone.
        const spec = RULES.find(rule => rule.id === 'SPEC');
        expect(spec?.lanes).toEqual(['ui']);
        expect((['ui', 'matrix', 'floor', 'macos'] as const).map(lane => appliesTo(spec!, 'main-installed-single', 932, 'dark-modern', lane))).toEqual([true, false, false, false]);
        expect(appliesTo(spec!, 'main-installed-single', 932, 'dark-modern')).toBe(true);
        expect(RULES.filter(rule => rule.lanes !== undefined).map(rule => rule.id)).toEqual(['SPEC']);
        const specLines = (lane: 'ui' | 'floor' | 'macos') => measureLines('main-installed-single', layout(), 'modern', {}, undefined, 932, undefined, 'dark-modern', undefined, lane).filter(line => line.name.startsWith('SPEC@'));
        expect(specLines('ui').length).toBeGreaterThan(0);
        expect([...specLines('floor'), ...specLines('macos')]).toEqual([]);
        expect(scopes('MS-8')).toEqual({ chrome: 'hard', 'first-row': 'hard' });
        // V72 closed at UX-P2.1a: the document never scrolls and the chrome holds still, hard in every state.
        expect(RULES.find(rule => rule.id === 'MS-8')?.pendingStates).toBeUndefined();
        expect(scopes('DS-OVERFLOW-6')).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard', browse: 'hard', details: 'hard', dialogs: 'hard', sources: 'hard', sidebar: 'hard' });
        expect(RULES.find(rule => rule.id === 'DS-OVERFLOW-6')?.pendingStates).toBeUndefined();
        // UX-P0.14's 220 px width closed at UX-P2.7a.
        expect(RULES.find(rule => rule.id === 'DS-OVERFLOW-6')?.pendingWidths).toBeUndefined();
        expect(scopes('DS-INSET-3')).toEqual({ rows: 'hard', toolbars: 'hard', headers: 'hard', 'main-header': 'hard', sidebar: { pending: 'P3.7a' } });
        expect(scopes('DS-OVERFLOW-2')).toEqual({ 'main-installed': 'hard', details: 'hard', sidebar: 'hard' });
        expect(scopes('DS-ROW-5')).toEqual({ ...mainHard(), sidebar: { pending: 'P3.7a' } });
        // UX-P0.13 (design-advisor ruling of 2026-10-24): every Appendix B rule of a P0 helper, and the five on P0.18.
        // UX-P3.3b: the empty state's top inset in the three main groups too, hard since its closing commit.
        expect(scopes('DS-INSET-4')).toEqual(Object.fromEntries(['details', 'main-installed', 'main-updates', 'browse'].map(group => [group, 'hard'])));
        expect(scopes('DS-ROW-1')).toEqual(mainHard());
        expect(scopes('DS-ROW-2')).toEqual({ 'main-installed': 'hard', details: 'hard', browse: 'hard' });
        expect(RULES.find(rule => rule.id === 'DS-ROW-2')?.pendingStates).toBeUndefined();
        expect(scopes('DS-ROW-3')).toEqual({ 'main-installed': 'hard', details: 'hard', 'main-updates': 'hard', browse: 'hard', sidebar: { pending: 'P3.7a' } });
        expect(scopes('DS-ROW-6')).toEqual(mainHard());
        expect(scopes('DS-ICON-3')).toEqual(mainHard());
        // UX-P1.4b: the two states whose readiness holds a Verified mark.
        expect(scopes('DS-ICON-4')).toEqual({ details: 'hard' });
        expect(RULES.find(rule => rule.id === 'DS-ICON-4')?.states).toEqual(['main-installed-details', 'main-transitive-details']);
        expect(scopes('DS-DENSITY-1')).toEqual({ ...mainHard(), sidebar: { pending: 'P3.7a' } });
        expect(scopes('DS-OVERFLOW-1')).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard', browse: 'hard', details: 'hard', sidebar: { pending: 'P3.7a' } });
        expect(scopes('DS-OVERFLOW-3')).toEqual({ toolbars: 'hard', tabs: 'hard', 'main-header': 'hard', details: 'hard' });
        expect(scopes('DS-OVERFLOW-5')).toEqual({ details: 'hard' });
        expect(scopes('DS-ALIGN-1')).toEqual({ details: 'hard' });
        // UX-P3.3a: the README tab shows no facts by design, the only state DS-ALIGN-1 has no subject in.
        expect(RULES.find(rule => rule.id === 'DS-ALIGN-1')?.exceptStates).toEqual(['main-details-readme']);
        expect(scopes('DS-COPY-2')).toEqual({ details: 'hard' });
        // UX-P3.3a: the details pane's weights and headings, hard with the facts.
        expect(scopes('DS-TYPE-3')).toEqual(Object.fromEntries(['main-installed', 'main-updates', 'browse', 'details', 'dialogs', 'sources', 'sidebar'].map(group => [group, 'hard'])));
        expect((scopes('DS-TYPE-9') as Record<string, unknown>).details).toBe('hard');
        // UX-P0.18 (design-advisor ruling of 2026-10-24): hard where the unchanged tree read green in every capture of the
        // group; the red groups and the groups no state measures yet to the items that make them hold.
        const hard = (...groups: string[]) => Object.fromEntries(groups.map(group => [group, 'hard']));
        expect(scopes('DS-TYPE-1')).toEqual({ ...hard('main-installed', 'main-updates', 'browse', 'details', 'dialogs', 'sidebar'), sources: 'hard' });
        expect(scopes('DS-TYPE-4')).toEqual({ ...hard('main-installed', 'main-updates', 'browse', 'details', 'dialogs'), sidebar: { pending: 'P3.7a' }, sources: 'hard' });
        expect(scopes('DS-TYPE-6')).toEqual(hard('main-installed', 'main-updates', 'details', 'sidebar', 'browse'));
        expect(scopes('DS-ROW-4')).toEqual(hard('main-installed', 'main-updates', 'browse', 'details', 'sidebar'));
        expect(scopes('DS-COPY-3')).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard', browse: 'hard', sidebar: { pending: 'P3.10' }, sources: 'hard' });
        expect(RULES.find(rule => rule.id === 'DS-COPY-3')?.pendingStates).toBeUndefined();
        // The Browse list under the details pane is a details-group state; its description reads 13 since UX-P3.2 (run 42292613923).
        expect(RULES.find(rule => rule.id === 'DS-TYPE-6')?.pendingStates).toBeUndefined();
        // The states without a row by design (the Updates cells since UX-P3.1b): DS-TYPE-6 and DS-ROW-4 print nothing there, never a pass.
        const noRow = ['main-installed-filter-nomatch', 'main-installed-loading', 'main-installed-empty', 'main-installed-error', 'main-updates-loading', 'main-updates-error', 'main-updates-empty', 'main-updates-empty-uptodate', 'main-updates-unavailable', 'main-browse-loading', 'main-browse-empty', 'main-browse-error', 'main-quicksearch-open', 'main-quicksearch-versions', 'main-quicksearch-loading', 'main-quicksearch-error', 'main-quicksearch-grouped'];
        for (const id of ['DS-TYPE-6', 'DS-ROW-4']) {
            const definition = RULES.find(rule => rule.id === id)!;
            expect(definition.exceptStates, id).toEqual(noRow);
            expect(noRow.map(state => appliesTo(definition, state)), id).toEqual(noRow.map(() => false));
            expect(appliesTo(definition, 'main-installed-single'), id).toBe(true);
        }
        expect(scopes('SPEC')).toEqual({ header: 'hard', list: 'hard', details: 'hard', readme: 'hard' });
        // UX-P3.3b closing 1: main-details-readme's header and list are hard; its details scope waits with SPEC's own.
        expect(RULES.find(rule => rule.id === 'SPEC')?.pendingStates).toBeUndefined();
        // UX-P0.14 (design-advisor ruling of 2026-10-24): the six of the research's 27 a ready state renders.
        expect(scopes('DS-FOCUS-1')).toEqual({ controls: 'hard', tabs: 'hard' });
        expect(scopes('DS-FOCUS-2')).toEqual({ rows: 'hard' });
        expect(scopes('DS-FOCUS-3')).toEqual({ rows: 'hard', tabs: 'hard' });
        expect(RULES.find(rule => rule.id === 'DS-FOCUS-3')?.states).toEqual(['main-installed-details', 'main-updates']);
        expect(scopes('DS-FOCUS-4')).toEqual({ rows: 'hard' });
        expect(RULES.find(rule => rule.id === 'DS-FOCUS-4')?.themes).toEqual(['dark-high-contrast', 'light-high-contrast']);
        expect(scopes('DS-STATE-7')).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard', browse: 'hard', details: 'hard' });
        // UX-P0.22 (V15): the token scrollbars in every group, pending on P3.9 (Modern UI's 8 px needs P1.1's look token).
        expect(scopes('DS-SCROLL-1')).toEqual(Object.fromEntries(['main-installed', 'main-updates', 'browse', 'details', 'dialogs', 'sources', 'sidebar'].map(group => [group, { pending: 'P3.9' }])));
        // Each rule's tolerance is one of D34's.
        expect(Object.fromEntries(RULES.map(rule => [rule.id, rule.tolerance]))).toEqual({
            'PF-6': 1, 'DS-GRID-1': 0.5, 'DS-GRID-2a': 0.5, 'DS-GRID-2b': 2, 'DS-INSET-1': 1, 'DS-INSET-2': 1, 'PF-3b': 1, 'PF-5': 1,
            ...Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`DS-HEIGHT-${i + 1}`, 1])),
            'PF-2': 1, 'PF-3a': 0, 'PF-4': 1, 'MS-8': 0.5, 'DS-OVERFLOW-6': 0, 'DS-INSET-3': 1, 'DS-OVERFLOW-2': 0, 'DS-ROW-5': 0,
            'DS-INSET-4': 1, 'DS-ROW-1': 1, 'DS-ROW-2': 1, 'DS-ROW-3': 0, 'DS-RADIUS-1': 0, 'DS-COLOR-6': 0, 'DS-ICON-2': 0, 'DS-COLOR-4': 0, 'DS-TYPE-5': 0.1, 'DS-COPY-5': 0, 'DS-COPY-2': 0, 'DS-TYPE-7': 0.1, 'DS-TYPE-9': 0, 'DS-DIVIDER-4': 0, 'DS-TYPE-8': 0.1, 'DS-HC-1': 0, 'DS-COLOR-7': 0, 'DS-COLOR-3': 0, 'DS-COLOR-2': 0, 'DS-DIVIDER-1': 0, 'DS-RADIUS-2': 0, 'DS-DIVIDER-2': 0, 'DS-DIVIDER-5': 0, 'DS-DIVIDER-3': 0, 'DS-COLOR-5': 0, 'DS-ROW-6': 0, 'DS-ICON-3': 0, 'DS-DENSITY-1': 1, 'DS-OVERFLOW-1': 0, 'DS-OVERFLOW-3': 0,
            'DS-OVERFLOW-5': 0, 'DS-ALIGN-1': 0, 'DS-TYPE-1': 0, 'DS-TYPE-4': 0.5, 'DS-TYPE-6': 0.1, 'DS-ROW-4': 0, 'DS-COPY-3': 0, SPEC: 1,
            'DS-FOCUS-1': 0, 'DS-FOCUS-2': 0, 'DS-FOCUS-3': 0, 'DS-FOCUS-4': 0, 'DS-STATE-7': 0, 'DS-STATE-1': 0, 'DS-STATE-2': 0, 'DS-STATE-3': 1, 'DS-STATE-4': 0, 'DS-COLOR-1': 0, 'DS-SCROLL-1': 0, 'DS-TYPE-2': 0.1, 'DS-TYPE-3': 0, 'DS-ICON-4': 0, 'DS-LOOK-1': 0,
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
        expect(groups['main-installed-hover-current']).toBe('details');
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
                    // SPEC's scopes divide the artboard's ids, whatever the state's group (UX-P2.8a).
                    && (rule.helper === 8 || stateGroup(candidate) === scope || elementGroups(stateGroup(candidate), candidate).includes(scope as never))) as string;
                expect(state, `a state for ${rule.id}/${scope}`).toBeDefined();
                // A spec line keeps its scope in its name in every state group (UX-P2.fix-8).
                const name = rule.helper !== 8 && stateGroup(state) === scope ? `${rule.id}@${state}` : `${rule.id}@${state}/${scope}`;
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
        // UX-P2.fix-2: the parity reads the exemplar; a lane's own workbench (the 1.90.0 floor's 24) is printed, never judged.
        const laneLine = (lane: Record<string, number>, exemplar: Record<string, number> = { settingsButton: 26 }) =>
            measureLines('main-installed-details', layout({}, { buttons: [button] }), 'classic', exemplar, undefined, undefined, undefined, undefined, lane).find(line => line.name === 'DS-HEIGHT-6@main-installed-details');
        expect(laneLine({ settingsButton: 24 })).toMatchObject({ pass: true, value: '26 (target 26, workbench 26, lane 24)' });
        expect(laneLine({ settingsButton: 26 })).toMatchObject({ pass: true, value: '26 (target 26, workbench 26)' });
        expect(laneLine({ settingsButton: 26 }, { settingsButton: 24 })).toMatchObject({ pass: false, value: '26 (target 26, workbench 24, lane 26)' });
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
        // UX-P2.6a: a section toggle's hit, the measurement behind its axe acceptance; measurable through toggles alone.
        const toggle = (hit: number) => ({ label: 'section-header-installed', height: 22, hit: { width: 200, height: hit } });
        expect(lineOf('sidebar-sections', { ...target(24), heights: { ...target(24).heights, toggles: [toggle(24)] } }, 'DS-HEIGHT-8@sidebar-sections')).toMatchObject({ pass: true, value: expect.stringContaining('section toggles hit 24 (at least 24)') });
        expect(lineOf('sidebar-sections', { ...target(24), heights: { ...target(24).heights, toggles: [toggle(22)] } }, 'DS-HEIGHT-8@sidebar-sections')).toMatchObject({ pass: false });
        expect(lineOf('sidebar-sections', layout({}, { toggles: [toggle(24)] }), 'DS-HEIGHT-8@sidebar-sections')).toMatchObject({ pass: true, value: 'section toggles hit 24 (at least 24)' });
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
        expect(lineOf('main-installed-loading', layout({}, { progress: [2] }), 'DS-HEIGHT-11@main-installed-loading')).toMatchObject({ pass: true, status: 'hard' });
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
        const row = (name: string, authors: { width: number; need: number; room: number } | undefined, list = 'installed-list') => ({ list, compact: false, name, nameCut: false, nameEllipsis: true, authors, versionShown: true, versionCut: false, badgesShown: 0, badgesClipped: 0, actionsEnd: undefined });
        const fits = { width: 120, need: 120, room: 140 };
        const defect = { width: 100, need: 150, room: 140 };
        const rows = (cut: boolean, width = 1200, dapper = cut ? defect : fits) => layout({ width, rows: [row('Serilog', fits), row('Dapper', dapper), row('Moq', undefined), row('Polly', defect, 'updates-list')] });
        expect(lineOf('main-installed-single', rows(false), 'PF-3a@main-installed-single')).toMatchObject({ pass: true, status: 'hard', value: '2 authors, none cut' });
        expect(lineOf('main-installed-single', rows(true), 'PF-3a@main-installed-single')).toMatchObject({ pass: false, value: 'cut: Dapper (100 of 140) (of 2)' });
        // A span that fills the room its line leaves and still overflows is the Extensions ellipsis, not the defect (UX-P2.8a).
        expect(lineOf('main-installed-single', rows(true, 1200, { width: 140, need: 231, room: 140 }), 'PF-3a@main-installed-single'))
            .toMatchObject({ pass: true, value: '2 authors, none cut; 1 wider than its line, ellipsized (Dapper 231 > 140)' });
        // scrollWidth is an integer and the rect is not: 136 against 135.8 is not a clip.
        expect(lineOf('main-installed-single', rows(true, 1200, { width: 135.8, need: 136, room: 247.3 }), 'PF-3a@main-installed-single')).toMatchObject({ pass: true, value: '2 authors, none cut' });
        expect(lineOf('main-installed-single', rows(true, 1200, { width: 140, need: 231, room: 140.4 }), 'PF-3a@main-installed-single')).toMatchObject({ pass: true });
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
        // The Installed↔Updates first-row y is hard since UX-P3.1a (owner moved from P3.1b, design-advisor ruling of 2026-11-06), and is compared in those two states only.
        expect(measureLines('main-updates', now({ 'main-header': header }, 172), 'modern', {}, reference).find(line => line.name === 'MS-8@main-updates/first-row'))
            .toMatchObject({ pass: false, status: 'hard', value: '172 (main-installed-single 160)' });
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

    it('holds DS-OVERFLOW-6 at the main panel\'s 220 px width (V50) in every state that has that width (UX-P0.14, UX-P2.7a)', () => {
        const sideways = layout({ documentOverflow: { clientWidth: 205, clientHeight: 788, scrollWidth: 231, scrollHeight: 803, outside: '.nuiget-badge 198.3,224.5 24.1×17.5' } });
        const at = (state: string, width: number) => measureLines(state, sideways, 'modern', {}, undefined, width).find(line => line.name === `DS-OVERFLOW-6@${state}`);
        expect(at('main-installed-single', 220)).toMatchObject({ status: 'hard', pass: false, value: 'document 205×788, scroll 231×803 (+15); outside: .nuiget-badge 198.3,224.5 24.1×17.5' });
        expect(at('main-installed-single', 220.6)?.status).toBe('hard');
        expect(at('main-installed-single', 400)?.status).toBe('hard');
        expect(at('main-installed-single', 1200)?.status).toBe('hard');
        expect(at('main-installed-single', 1600)?.status).toBe('hard');
        expect(at('main-installed-all', 220)?.status).toBe('hard');
        // PF-6 holds there too since UX-P2.7b: the list pane's floor keeps the tab label's box.
        expect(measureLines('main-installed-single', sideways, 'modern', {}, undefined, 220).find(line => line.name === 'PF-6@main-installed-single')?.status).toBe('hard');
    });

    it('checks DS-INSET-3\'s trailing ends, DS-OVERFLOW-2\'s collisions and DS-ROW-5\'s truncation order', () => {
        const row = (name: string, overrides: Record<string, unknown> = {}) => ({ list: 'installed-list', compact: false, name, nameCut: false, nameEllipsis: true, authors: undefined, versionShown: true, versionCut: false, badgesShown: 0, badgesClipped: 0, actionsEnd: undefined, ...overrides });
        const built = layout({
            rows: [row('Serilog', { actionsEnd: 6 }), row('Moq', { actionsEnd: 2 }), row('Polly', { compact: true, actionsEnd: 6 })],
            sections: [{ id: 'direct', variant: 'group', insets: undefined, above: undefined, below: undefined, trailingEnd: 16 }, { id: 'installed', variant: 'pane', insets: undefined, above: undefined, below: undefined, trailingEnd: 2 }],
            toolbars: [{ id: 'installed-toolbar', insets: { start: 16, end: 6, top: 4, bottom: 4 } }],
        });
        expect(lineOf('main-installed-hover', built, 'DS-INSET-3@main-installed-hover/rows')).toMatchObject({ pass: false, status: 'hard', value: 'row actions 2, 6 (target 6)' });
        expect(lineOf('main-installed-single', built, 'DS-INSET-3@main-installed-single/headers')).toMatchObject({ pass: true, status: 'hard', value: 'group headers 16 (target 16)' });
        // A box inside a group row is a group header whatever its variant; a flat list has none to read.
        const nested = layout({ sections: [{ id: 'transitive-net8.0', variant: 'level', inList: true, insets: undefined, above: undefined, below: undefined, trailingEnd: 6 }] });
        expect(lineOf('main-transitive-expanded', nested, 'DS-INSET-3@main-transitive-expanded/headers')).toMatchObject({ pass: false, value: 'group headers 6 (target 16)' });
        expect(lineOf('main-updates', layout({ flatList: true, mainHeader: undefined }), 'DS-INSET-3@main-updates/headers')).toMatchObject({ pass: true, value: 'no group header (flat list)' });
        expect(lineOf('main-installed-single', built, 'DS-INSET-3@main-installed-single/toolbars')).toMatchObject({ pass: false, status: 'hard', value: 'toolbar end 6 (target 16)' });
        expect(lineOf('main-installed-single', layout({ toolbars: [{ id: 'installed-toolbar', insets: { start: 16, end: 16, top: 4, bottom: 4 } }] }), 'DS-INSET-3@main-installed-single/toolbars')).toMatchObject({ pass: true, value: 'toolbar end 16 (target 16)' });
        expect(lineOf('sidebar-sections', built, 'DS-INSET-3@sidebar-sections', 'classic')).toMatchObject({ pass: false, value: 'section headers 2 (target 12); row actions 6 (target 6)' });
        // DS-OVERFLOW-2 prints every section-header badge's rect, offending or not, and passes no empty page.
        const overflow = layout({ overflow: { containers: 9, collisions: [], outside: ['[section-box-project-unsupported.csproj] .nuiget-badge 1171–1195 outside 16–1184'], clipped: [], count: 1, badges: ['project-unsupported.csproj "Unsupported" 1171–1195 (box right 1200)'] } });
        expect(lineOf('main-installed-all', overflow, 'DS-OVERFLOW-2@main-installed-all')).toMatchObject({
            pass: false, status: 'hard',
            value: '1 offending in 9 containers (outside: [section-box-project-unsupported.csproj] .nuiget-badge 1171–1195 outside 16–1184); badges: project-unsupported.csproj "Unsupported" 1171–1195 (box right 1200)',
        });
        expect(lineOf('main-installed-all', layout(), 'DS-OVERFLOW-2@main-installed-all')).toMatchObject({ pass: false, value: 'not measurable' });
        // DS-ROW-5: on a compact row's one line a name cut beside an uncut version is cut too early; a comfortable name ellipsizes beside whole badges.
        const truncation = layout({ rows: [
            row('Microsoft.Extensions.Logging', { nameCut: true, badgesShown: 1 }), row('Microsoft.Extensions.Hosting', { nameCut: true }),
            row('Polly', { compact: true, nameCut: true, versionShown: false }), row('Serilog.Sinks.Console', { compact: true, nameCut: true, versionCut: true }),
            row('Newtonsoft.Json', { compact: true, nameCut: true }),
        ] });
        expect(lineOf('main-installed-single', truncation, 'DS-ROW-5@main-installed-single')).toMatchObject({ pass: true, value: expect.stringMatching(/^2 rows, 2 names cut; badges clipped 0; version whole ×\d$/) });
        expect(lineOf('main-installed-single', layout({ rows: [row('Newtonsoft.Json', { badgesShown: 1, badgesClipped: 1 })] }), 'DS-ROW-5@main-installed-single')).toMatchObject({ pass: false, value: expect.stringMatching(/^1 rows, 0 names cut; badges clipped 1; version whole ×\d$/) });
        // The facts line yields the authors, never the version (judge main-installed-single#D7, UX-P2.8a).
        expect(lineOf('main-installed-single', layout({ rows: [row('Serilog', { versionShown: true, versionCut: false })] }), 'DS-ROW-5@main-installed-single')).toMatchObject({ pass: true, value: '1 rows, 0 names cut; badges clipped 0; version whole ×1' });
        expect(lineOf('main-installed-single', layout({ rows: [row('Serilog', { versionShown: true, versionCut: true })] }), 'DS-ROW-5@main-installed-single')).toMatchObject({ pass: false, value: '1 rows, 0 names cut; badges clipped 0; version whole ×0, 1 cut' });
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
        // A pane under the row breakpoint measures the name clause alone (DS-ROW-6, UX-P2.8a).
        const noIcon = (nameLeft: number) => row({ icon: undefined, nameLeft });
        expect(value('main-installed-single', facts({ rows: [noIcon(30), noIcon(30)] }), 'DS-ROW-2@main-installed-single')).toMatchObject({ pass: true, value: 'icon column hidden (DS-ROW-6), name left spread 0 (2 rows)' });
        expect(value('main-installed-single', facts({ rows: [noIcon(0), noIcon(100)] }), 'DS-ROW-2@main-installed-single')).toMatchObject({ pass: false });
        // Across views (UX-P3.2): a Browse row against the first row of main-installed-single, read from the run's reference.
        expect(ROW_LEFTS_REFERENCE).toBe('main-installed-single');
        expect(rowLeftsOf('main-installed-single', facts({ rows: [row({ compact: true }), row()] }))).toEqual({ state: 'main-installed-single', icon: 46, name: 98 });
        expect(rowLeftsOf('main-installed-single', facts({ rows: [] }))).toBeUndefined();
        const across = (built: Layout, reference: ChromeReference | undefined) => measureLines('main-browse-results', built, 'modern', {}, reference).find(line => line.name === 'DS-ROW-2@main-browse-results');
        const reference = (name: number): ChromeReference => ({ state: 'main-installed-single', chrome: {}, firstRow: undefined, rowLefts: { state: 'main-installed-single', icon: 46, name } });
        const browse = facts({ rows: [row({ list: 'browse-list' }), row({ list: 'browse-list' })] });
        expect(across(browse, reference(98))).toMatchObject({ pass: true, value: 'icon left spread 0, name left spread 0 (2 rows); against main-installed-single: icon 0, name 0' });
        expect(across(browse, reference(128))).toMatchObject({ pass: false, value: 'icon left spread 0, name left spread 0 (2 rows); against main-installed-single: icon 0, name -30' });
        expect(across(browse, undefined)).toMatchObject({ pass: false, value: expect.stringContaining('against main-installed-single: not measurable (no reference row)') });
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
        // UX-P3.6: a field inside a layer is read against the layer's input radius.
        const layered = (radius: string) => layout({}, { buttons: [button()], inputs: [{ kind: 'field', id: 'add-source-url', height: 25, radius, inLayer: true }], layerInputRadius: '4px' } as never);
        expect(lineOf('main-sources-add', layered('4px'), 'DS-RADIUS-1@main-sources-add')).toMatchObject({ pass: true, status: 'hard', value: 'buttons 4px (target 4px); field-in-layer 4px (target 4px)' });
        expect(lineOf('main-sources-add', layered('6px'), 'DS-RADIUS-1@main-sources-add')).toMatchObject({ pass: false });
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
        // UX-P2.fix-1: the roles that share focusBorder's colour in the theme are printed, never counted.
        expect(value('main-installed-single', facts({ rows: [rest], focusCoincides: ['badge-bg', 'link'] }), 'DS-COLOR-5@main-installed-single/rows')).toMatchObject({ pass: true, value: '0 elements of an unfocused row in focusBorder; coincides: badge-bg, link' });
        // DS-ROW-6 hides the label badges at most 250; DS-ROW-5 fails a clipped one above (UX-P2.2).
        const small = { left: 46, right: 70, w: 24, h: 24, centre: 136, radius: '2px' };
        const clipFacts = (badgesShown: number, badgesClipped: number) => ({ list: 'installed-list', compact: false, name: 'Newtonsoft.Json', nameCut: false, nameEllipsis: true, authors: undefined, versionShown: true, versionCut: false, badgesShown, badgesClipped, actionsEnd: undefined });
        const narrowHidden = { ...facts({ rows: [row({ icon: small })], listPaneWidth: 210 }), rows: [clipFacts(0, 0)] };
        expect(value('main-installed-single', narrowHidden, 'DS-ROW-6@main-installed-single')).toMatchObject({ pass: true, value: 'pane 210: icon 24 (target 24); badges hidden ×1' });
        expect(value('main-installed-single', narrowHidden, 'DS-ROW-5@main-installed-single')).toMatchObject({ pass: true, value: expect.stringMatching(/^1 rows, 0 names cut; badges clipped 0; version whole ×\d$/) });
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
        expect(value('main-installed-details', facts({ detailsHeader: { insets: { start: 20, end: 20, top: 20, bottom: 20 }, titleLeft: 620, tabLabelLeft: 620 } }), 'DS-INSET-4@main-installed-details')).toMatchObject({ pass: true, status: 'hard' });
        expect(value('main-installed-details', facts({ detailsHeader: { insets: { start: 16, end: 20, top: 20, bottom: 20 }, titleLeft: 620, tabLabelLeft: 620 } }), 'DS-INSET-4@main-installed-details')).toMatchObject({ pass: false });
        expect(value('main-installed-details', facts({ detailsHeader: { insets: { start: 20, end: 20, top: 20, bottom: 20 }, titleLeft: 620, tabLabelLeft: 632 } }), 'DS-INSET-4@main-installed-details')).toMatchObject({ pass: false });
        // UX-P3.3b: the transitive view has no tabs by design; a pane without a package reads its empty state's top inset.
        expect(value('main-transitive-details', facts({ detailsHeader: { insets: { start: 20, end: 20, top: 20, bottom: 20 }, titleLeft: 444, tabLabelLeft: undefined } }), 'DS-INSET-4@main-transitive-details'))
            .toMatchObject({ pass: true, value: 'header 20/20 20/20 (target 20); title 444, tab label absent (no tabs)' });
        expect(value('main-updates', facts({ detailsEmpty: { top: 20 } }), 'DS-INSET-4@main-updates')).toMatchObject({ pass: true, value: 'empty top 20 (target 20)', status: 'hard' });
        expect(value('main-updates', facts({ detailsEmpty: { top: 8 } }), 'DS-INSET-4@main-updates')).toMatchObject({ pass: false, value: 'empty top 8 (target 20)' });
        expect(value('main-updates', facts({}), 'DS-INSET-4@main-updates')).toMatchObject({ pass: false, value: expect.stringContaining('not measurable (no details header or empty state)') });
        // UX-P3.3b: DS-OVERFLOW-5 reads the toolbar and the header apart, and the sash's bounds against the two px minimums.
        const split = (width: number, min: number, max: number) => ({ width, sash: 4, min, max, listMin: 170, detailsMin: 220 });
        expect(value('main-browse-details', facts({ minContent: { toolbar: undefined, header: { scroll: 776, client: 776 } }, split: split(1200, 15, 81) }), 'DS-OVERFLOW-5@main-browse-details'))
            .toMatchObject({ pass: true, value: 'toolbar absent; header min-content 776 in 776; bounds 15%..81% (list 180 ≥ 170, details 224 ≥ 220)' });
        expect(value('main-installed-details', facts({ minContent: { toolbar: undefined, header: { scroll: 226, client: 226 } }, split: split(1200, 25, 75) }), 'DS-OVERFLOW-5@main-installed-details'))
            .toMatchObject({ pass: true });
        expect(value('main-installed-details', facts({ minContent: { toolbar: undefined, header: { scroll: 226, client: 226 } }, split: split(1200, 10, 90) }), 'DS-OVERFLOW-5@main-installed-details'))
            .toMatchObject({ pass: false, value: expect.stringContaining('bounds 10%..90% (list 120 ≥ 170, details 116 ≥ 220)') });
        expect(value('main-installed-details', facts({ minContent: { toolbar: undefined, header: { scroll: 100, client: 100 } }, split: split(300, 57, 57) }), 'DS-OVERFLOW-5@main-installed-details'))
            .toMatchObject({ pass: true, value: expect.stringContaining('bounds 57%..57% crossed, list at 171 (≥ 170)') });
        expect(value('main-installed-details', facts({ factLefts: [[700, 700, 712]] }), 'DS-ALIGN-1@main-installed-details')).toMatchObject({ pass: false, status: 'hard' });
        expect(value('main-installed-details', facts({ factLefts: [[700, 700], [640, 640]] }), 'DS-ALIGN-1@main-installed-details')).toMatchObject({ pass: true });
        expect(value('main-details-readme', facts({}), 'DS-ALIGN-1@main-details-readme')).toBeUndefined();
        // DS-COPY-2 (UX-P3.3a): no details label ends in ':', and "Author(s)" is never one.
        expect(value('main-installed-details', facts({ detailsLabels: ['Installed', 'Version', 'Version', 'Authors'] }), 'DS-COPY-2@main-installed-details'))
            .toMatchObject({ pass: true, value: 'labels 4: ok', status: 'hard' });
        expect(value('main-installed-details', facts({ detailsLabels: ['Installed:', 'Version'] }), 'DS-COPY-2@main-installed-details'))
            .toMatchObject({ pass: false, value: 'labels 2; off: "Installed:"' });
        expect(value('main-installed-details', facts({ detailsLabels: ['Version', 'Author(s)'] }), 'DS-COPY-2@main-installed-details'))
            .toMatchObject({ pass: false, value: 'labels 2; off: "Author(s)"' });
        expect(value('main-installed-details', facts({}), 'DS-COPY-2@main-installed-details')).toMatchObject({ pass: false, value: expect.stringContaining('not measurable (no label)') });
        // UX-P1.1: the font ramp and the two weights, hard; UX-P1.3: the look's tokens, hard.
        const text = (fontSize: number, fontWeight: number, header = false) => ({ fontSize, fontWeight, header });
        expect(value('main-installed-single', facts({ textStyles: [text(13, 600), text(11, 400)] }), 'DS-TYPE-2@main-installed-single')).toMatchObject({ pass: true, status: 'hard' });
        expect(value('main-installed-single', facts({ textStyles: [text(14.95, 600)] }), 'DS-TYPE-2@main-installed-single')).toMatchObject({ pass: false, value: 'off the ramp: 14.95' });
        // UX-P3.4 (design-advisor ruling of 2026-11-07): README headings are on the ramp; the README body is not read.
        expect(value('main-details-readme', facts({ textStyles: [text(13, 600)], readmeHeadings: [18, 18, 13, 26] }), 'DS-TYPE-2@main-details-readme'))
            .toMatchObject({ pass: true, status: 'hard', value: expect.stringMatching(/; readme headings 4 on the ramp$/) });
        expect(value('main-details-readme', facts({ textStyles: [text(13, 600)], readmeHeadings: [18.2, 18] }), 'DS-TYPE-2@main-details-readme'))
            .toMatchObject({ pass: false, value: expect.stringMatching(/; readme headings off the ramp: 18\.2$/) });
        expect(value('main-installed-single', facts({}), 'DS-TYPE-2@main-installed-single')).toMatchObject({ pass: false, value: expect.stringContaining('not measurable') });
        expect(value('main-installed-single', facts({ textStyles: [text(11, 700, true)] }), 'DS-TYPE-3@main-installed-single')).toMatchObject({ pass: true, status: 'hard' });
        expect(value('main-installed-single', facts({ textStyles: [text(11, 700, true)], dataLook: 'modern' }), 'DS-TYPE-3@main-installed-single')).toMatchObject({ pass: false });
        expect(value('main-installed-single', facts({ textStyles: [text(13, 700)] }), 'DS-TYPE-3@main-installed-single')).toMatchObject({ pass: false });
        expect(value('main-installed-details', facts({ textStyles: [text(13, 700)] }), 'DS-TYPE-3@main-installed-details')).toMatchObject({ pass: false, status: 'hard' });
        expect(value('main-installed-single', facts({ lookTokens: { '--nuiget-scrollbar-size': '10px' } }), 'DS-LOOK-1@main-installed-single')).toMatchObject({ pass: false, status: 'hard' });
        // UX-P1.4b: the Verified mark, 12 px in its role's colour (the 16 px clause dropped at UX-P3.3b); never a pass without one.
        const mark = (overrides: Record<string, unknown> = {}) => ({ w: 12, h: 12, colour: 'rgb(77, 170, 252)', ...overrides });
        expect(value('main-installed-details', facts({ verifiedMarks: [mark(), mark()], verifiedForeground: '#4daafc' }), 'DS-ICON-4@main-installed-details')).toMatchObject({ pass: true, status: 'hard' });
        expect(value('main-installed-details', facts({ verifiedMarks: [mark({ w: 16, h: 16 })], verifiedForeground: '#4daafc' }), 'DS-ICON-4@main-installed-details')).toMatchObject({ pass: false });
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
        // The authors are the Extensions publisher's 11/600 (UX-P2.8a).
        const authors = (fontWeight: string) => [...meta(11), { kind: 'meta', fontSize: 11, colour: 'rgb(157, 157, 157)', selected: false, fontWeight, authors: true }];
        expect(value('main-installed-single', facts({ metaText: authors('600'), descriptionForeground: '#9d9d9d' }), 'DS-TYPE-6@main-installed-single'))
            .toMatchObject({ pass: true, value: 'meta 11 ×2 (target 11); 0 meta off descriptionForeground; authors 600 (target 600)' });
        expect(value('main-installed-single', facts({ metaText: authors('400'), descriptionForeground: '#9d9d9d' }), 'DS-TYPE-6@main-installed-single')).toMatchObject({ pass: false });
        // The computed 11.05 of the run is within the rule's own 0.1.
        expect(value('main-installed-single', facts({ metaText: meta(11.05), descriptionForeground: '#9d9d9d' }), 'DS-TYPE-6@main-installed-single')).toMatchObject({ pass: true, status: 'hard' });
        expect(value('main-browse-details', facts({ metaText: [...meta(11), { kind: 'description', fontSize: 11.05, colour: 'rgb(157, 157, 157)', selected: false }], descriptionForeground: '#9d9d9d' }), 'DS-TYPE-6@main-browse-details'))
            .toMatchObject({ pass: false, status: 'hard' });
        expect(value('main-installed-unsupported', facts({ copyEnds: [{ kind: 'banner', text: 'Unsupported project: requires .NET SDK 10 or newer' }] }), 'DS-COPY-3@main-installed-unsupported'))
            .toMatchObject({ pass: false, status: 'hard' });
        expect(value('main-installed-single', facts({ metaText: meta(11, 'rgb(204, 204, 204)'), descriptionForeground: '#9d9d9d' }), 'DS-TYPE-6@main-installed-single'))
            .toMatchObject({ pass: false, value: 'meta 11 (target 11); 1 meta off descriptionForeground' });
        expect(value('main-installed-hover', facts({ rows: [row({ actions: 4 })] }), 'DS-ROW-4@main-installed-hover')).toMatchObject({ pass: false });
        expect(value('main-installed-hover', facts({ rows: [row({ actions: 3 })] }), 'DS-ROW-4@main-installed-hover')).toMatchObject({ pass: true });
        expect(value('main-installed-empty', facts({ copyEnds: [{ kind: 'empty', text: 'No packages installed' }] }), 'DS-COPY-3@main-installed-empty')).toMatchObject({ pass: false, value: 'no full stop: empty "No packages installed"' });
        expect(value('main-installed-empty', facts({ copyEnds: [{ kind: 'empty', text: 'No packages installed.' }] }), 'DS-COPY-3@main-installed-empty')).toMatchObject({ pass: true });
        expect(value('main-installed-single', facts({}), 'DS-COPY-3@main-installed-single')).toBeUndefined();
        // UX-P2.8b: a message leaf is read in All Projects, and "unresolved" has no subject.
        expect(value('main-installed-all', facts({ copyEnds: [{ kind: 'leaf', text: 'Unsupported project: requires .NET SDK 10 or newer.' }] }), 'DS-COPY-3@main-installed-all')).toMatchObject({ pass: true });
        expect(value('main-installed-unresolved', facts({}), 'DS-COPY-3@main-installed-unresolved')).toBeUndefined();
    });

    it('leaves the group header unread in the cells with no list (UX-P2.8b; the Updates cells without a row, UX-P3.1b)', () => {
        const updatesNoList = ['main-updates-loading', 'main-updates-error', 'main-updates-empty', 'main-updates-empty-uptodate', 'main-updates-unavailable', 'main-browse-loading', 'main-browse-empty', 'main-browse-error'];
        for (const id of ['DS-HEIGHT-10', 'DS-TYPE-8', 'DS-HC-1']) {
            const definition = RULES.find(rule => rule.id === id)!;
            expect(definition.exceptStates, id).toEqual(['main-quicksearch-open', 'main-quicksearch-versions', 'main-quicksearch-loading', 'main-quicksearch-error', 'main-quicksearch-grouped', 'main-installed-loading', 'main-installed-error', ...updatesNoList]);
            expect(appliesTo(definition, 'main-installed-revalidating'), id).toBe(true);
        }
        const inset = RULES.find(rule => rule.id === 'DS-INSET-3')!;
        expect(inset.exceptStates).toBeUndefined();
        const cells = (stateCells: Record<string, unknown>) => layout({ endOfP0: { ...layout().endOfP0, fonts: { root: 'sans', others: [] }, stateCells: { ...layout().endOfP0.stateCells, ...stateCells } } as Layout['endOfP0'] });
        expect(lineOf('main-installed-loading', cells({ skeletonRows: 3 }), 'DS-INSET-3@main-installed-loading/headers')).toMatchObject({ pass: true, value: 'no group header (no list)' });
        expect(lineOf('main-installed-loading', cells({ skeletonRows: 3 }), 'DS-INSET-2@main-installed-loading/headers')).toMatchObject({ pass: true, value: 'no group header (no list)' });
        expect(lineOf('main-installed-error', cells({ banners: [{ severity: 'error', glyphs: ['error'], buttons: 1, text: 'It failed.' }] }), 'DS-TYPE-5@main-installed-error/headers')).toMatchObject({ pass: true, value: 'no group header (no list)' });
        expect(RULES.find(rule => rule.id === 'DS-OVERFLOW-2')?.exceptStates).toEqual(['main-installed-loading', 'main-installed-error', ...updatesNoList]);
        // UX-P3.3b: and the flat Browse list (the UX-P3.2 form) for DS-GRID-2b.
        expect(RULES.find(rule => rule.id === 'DS-GRID-2b')?.exceptStates).toEqual(['main-installed-loading', 'main-installed-error', ...updatesNoList, 'main-browse-details']);
        // A list with no row and only its empty sentence has no group header either (the Updates tab of one project, UX-P3.1b).
        const empties = [{ textAlign: 'start', paddingLeft: 20, paddingRight: 20, gap: 8, buttons: 0, buttonWidth: undefined, width: 400 }];
        expect(lineOf('main-updates-empty', cells({ empties }), 'DS-INSET-3@main-updates-empty/headers')).toMatchObject({ pass: true, value: 'no group header (no list)' });
        expect(lineOf('main-updates-empty', cells({ empties }), 'DS-TYPE-5@main-updates-empty/headers')).toMatchObject({ pass: true, value: 'no group header (no list)' });
        // Keyed to the Updates cells: an Installed cell with an empty state that lost its group row still fails.
        expect(lineOf('main-installed-empty', cells({ empties }), 'DS-INSET-3@main-installed-empty/headers')).toMatchObject({ pass: false });
        expect(lineOf('main-installed-error', cells({ banners: [{ severity: 'error', glyphs: ['error'], buttons: 1, text: 'It failed.' }] }), 'DS-INSET-3@main-installed-error/headers')).toMatchObject({ pass: true });
        expect(lineOf('main-installed-single', cells({}), 'DS-INSET-3@main-installed-single/headers')).toMatchObject({ pass: false });
        expect(lineOf('main-installed-all', cells({ testIds: ['installed-provisional-unsupported.csproj', 'installed-unsupported-unsupported.csproj'] }), 'DS-STATE-1@main-installed-all')).toMatchObject({ pass: false, value: expect.stringContaining('missing: installed-empty-empty.csproj') });
    });

    it('reads a state cell on its own list, keyed by the state group: the Updates cells on updates-*, the Browse cells on browse-*, every other on installed-* (UX-P3.1b, UX-P3.2)', () => {
        expect(cellList('main-browse-loading')).toBe('browse');
        expect(cellList('main-quicksearch-open')).toBe('browse');
        expect(cellList('main-updates-loading')).toBe('updates');
        expect(cellList('main-updates-all')).toBe('updates');
        expect(cellList('main-installed-loading')).toBe('installed');
        expect(COLLECT_LAYOUT).toContain('[data-testid="\' + cellList + \'-progress"]');
        expect(COLLECT_LAYOUT).toContain('[data-testid="\' + cellList + \'-list"]');
        expect(COLLECT_LAYOUT).not.toContain('installed-progress');
    });

    it('reads the quick-search popup: its radii, its rows and its group separators and labels (UX-P3.2)', () => {
        const popup = (overrides: Record<string, unknown> = {}) => layout({ endOfP0: { ...layout().endOfP0, fonts: { root: 'sans', others: [] }, popup: {
            radius: '8px', layerTarget: '8px', optionRadii: ['4px', '4px'], rowTarget: '4px', rowHeightTarget: '24px', optionHeights: [22, 22],
            groups: [{ width: 0, style: 'none', colour: 'rgb(0, 0, 0)' }, { width: 1, style: 'solid', colour: 'rgb(60, 60, 60)' }],
            labels: [{ transform: 'none', size: 11, colour: 'rgb(157, 157, 157)' }, { transform: 'none', size: 11, colour: 'rgb(157, 157, 157)' }],
            pickerBorder: 'rgb(60, 60, 60)', description: 'rgb(157, 157, 157)', ...overrides,
        } } as Layout['endOfP0'] });
        expect(lineOf('main-quicksearch-open', popup(), 'DS-RADIUS-2@main-quicksearch-open/popup')).toMatchObject({ pass: true, status: 'hard', value: 'layer 8, rows 4 ×2 (target layer 8, rows 4)' });
        expect(lineOf('main-quicksearch-open', popup({ radius: '2px' }), 'DS-RADIUS-2@main-quicksearch-open/popup')).toMatchObject({ pass: false });
        // The rows scope does not apply in a popup state; the popup scope applies in no list state.
        expect(lineOf('main-quicksearch-open', popup(), 'DS-RADIUS-2@main-quicksearch-open/rows')).toBeUndefined();
        expect(lineOf('main-browse-results', popup(), 'DS-RADIUS-2@main-browse-results/popup')).toBeUndefined();
        expect(lineOf('main-quicksearch-open', popup(), 'DS-HEIGHT-2@main-quicksearch-open/popup')).toMatchObject({ pass: true, status: { pending: 'P3.7a' } });
        expect(lineOf('main-quicksearch-open', popup({ optionHeights: [24] }), 'DS-HEIGHT-2@main-quicksearch-open/popup')).toMatchObject({ pass: false });
        expect(lineOf('main-quicksearch-grouped', popup(), 'DS-DIVIDER-3@main-quicksearch-grouped')).toMatchObject({ pass: true, value: 'labels 2 (text-transform none, 11px descriptionForeground); separators 1/1 pickerGroup.border' });
        expect(lineOf('main-quicksearch-grouped', popup({ labels: [{ transform: 'uppercase', size: 11, colour: 'rgb(157, 157, 157)' }, { transform: 'none', size: 11, colour: 'rgb(157, 157, 157)' }] }), 'DS-DIVIDER-3@main-quicksearch-grouped')).toMatchObject({ pass: false });
        expect(lineOf('main-quicksearch-grouped', popup({ groups: [{ width: 0, style: 'none', colour: 'rgb(0, 0, 0)' }, { width: 0, style: 'none', colour: 'rgb(0, 0, 0)' }] }), 'DS-DIVIDER-3@main-quicksearch-grouped')).toMatchObject({ pass: false });
        expect(lineOf('main-quicksearch-grouped', layout(), 'DS-DIVIDER-3@main-quicksearch-grouped')).toMatchObject({ pass: false });
        expect(lineOf('main-quicksearch-open', popup(), 'DS-DIVIDER-3@main-quicksearch-open')).toBeUndefined();
    });

    it('reads the open dialog: its layer radius, its shadow alone on the page, the black scrim and its footer\'s symmetry (UX-P3.5)', () => {
        const layers = {
            radius: '8px', radiusTarget: '8px', boxShadow: 'rgba(0, 0, 0, 0.36) 0px 2px 8px 0px', shadowColour: 'rgba(0, 0, 0, 0.36)', shadowed: [],
            scrim: 'rgba(0, 0, 0, 0.5)', surface: 'rgb(31, 31, 31)', footer: { left: 0, right: 0, top: 0, bottom: 0 },
        };
        const dialog = (overrides: Record<string, unknown> = {}) => layout({ endOfP0: { ...layout().endOfP0, fonts: { root: 'sans', others: [] }, layers: { ...layers, ...overrides } } as Layout['endOfP0'] });
        const state = 'main-installed-bulk-dialog';
        expect(lineOf(state, dialog(), `DS-RADIUS-2@${state}/layers`)).toMatchObject({ pass: true, status: 'hard', value: 'layer 8 (target 8)' });
        expect(lineOf(state, dialog({ radius: '4px' }), `DS-RADIUS-2@${state}/layers`)).toMatchObject({ pass: false, value: 'layer 4 (target 8)' });
        expect(lineOf(state, dialog(), `DS-DIVIDER-2@${state}/layers`)).toMatchObject({ pass: true, value: 'layer 0px 2px 8px 0px rgba(0, 0, 0, 0.36); page 0 shadowed' });
        expect(lineOf(state, dialog({ boxShadow: 'rgba(0, 0, 0, 0.36) 0px 0px 8px 0px' }), `DS-DIVIDER-2@${state}/layers`)).toMatchObject({ pass: false });
        expect(lineOf(state, dialog({ shadowed: ['.nuiget-row'] }), `DS-DIVIDER-2@${state}/layers`)).toMatchObject({ pass: false, value: expect.stringContaining('page 1 shadowed: .nuiget-row') });
        // High contrast: the shadow token is transparent.
        expect(lineOf(state, dialog({ boxShadow: 'rgba(0, 0, 0, 0) 0px 2px 8px 0px', shadowColour: 'rgba(0, 0, 0, 0)' }), `DS-DIVIDER-2@${state}/layers`)).toMatchObject({ pass: true });
        expect(lineOf(state, dialog(), `DS-DIVIDER-5@${state}`)).toMatchObject({ pass: true, status: 'hard', value: 'scrim rgba(0, 0, 0, 0.5) over #1f1f1f → #101010 (not lighter)' });
        // Black at 50 % over black is equal: not lighter (dark high contrast).
        expect(lineOf(state, dialog({ surface: 'rgb(0, 0, 0)' }), `DS-DIVIDER-5@${state}`)).toMatchObject({ pass: true });
        expect(lineOf(state, dialog({ scrim: 'rgba(31, 31, 31, 0.6)' }), `DS-DIVIDER-5@${state}`)).toMatchObject({ pass: false });
        expect(lineOf(state, dialog(), `DS-INSET-2@${state}`)).toMatchObject({ pass: true, value: 'footer 0/0 0/0' });
        expect(lineOf(state, dialog({ footer: { left: 0, right: 8, top: 0, bottom: 0 } }), `DS-INSET-2@${state}`)).toMatchObject({ pass: false });
        expect(lineOf(state, layout(), `DS-DIVIDER-5@${state}`)).toMatchObject({ pass: false, value: expect.stringContaining('no open dialog') });
        // Outside the dialog states the rules print nothing.
        expect(lineOf('main-installed-single', dialog(), 'DS-DIVIDER-2@main-installed-single/layers')).toBeUndefined();
    });

    it('reads the outer frame\'s offset: anything but 0,0 fails the state (UX-P2.8b)', () => {
        expect(outerScrollVerdict(0, 0)).toEqual({ text: 'outer scroll 0,0', pass: true });
        expect(outerScrollVerdict(0, 5)).toEqual({ text: 'outer scroll 0,5', pass: false });
    });

    it('holds the Installed and Updates cells hard, with their later owners (UX-P2.8b, UX-P3.1b)', () => {
        const scopesOf = (id: string) => RULES.find(rule => rule.id === id)?.scopes;
        // UX-P3.6: the sources dialog's cells read pending for its reading run.
        expect(scopesOf('DS-STATE-1')).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard', browse: 'hard', sources: 'hard' });
        for (const id of ['DS-STATE-2', 'DS-STATE-3', 'DS-STATE-4', 'DS-COLOR-1']) {
            expect(scopesOf(id), id).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard', browse: 'hard', details: { pending: 'P3.10' }, sidebar: { pending: 'P3.10' }, sources: 'hard' });
        }
    });

    it('reads the Installed cells: markers, the bar, the welcome layout, the inline message and the colour roles (UX-P2.8b)', () => {
        const facts = (cells: Record<string, unknown>) => layout({ endOfP0: { ...layout().endOfP0, fonts: { root: 'sans', others: [] }, stateCells: { ...layout().endOfP0.stateCells, ...cells } } as Layout['endOfP0'] });
        const line = (state: string, cells: Record<string, unknown>, name: string) => lineOf(state, facts(cells), name);
        expect(line('main-installed-empty', { testIds: ['installed-empty'] }, 'DS-STATE-1@main-installed-empty')).toMatchObject({ pass: true, status: 'hard' });
        expect(line('main-installed-empty', {}, 'DS-STATE-1@main-installed-empty')).toMatchObject({ pass: false, value: 'present: none; missing: installed-empty' });
        expect(line('main-installed-loading', { testIds: ['installed-progress'], skeletonRows: 3 }, 'DS-STATE-1@main-installed-loading')).toMatchObject({ pass: true });
        expect(line('main-installed-loading', { testIds: ['installed-progress'], rows: 2 }, 'DS-STATE-1@main-installed-loading')).toMatchObject({ pass: false });
        expect(line('main-installed-unresolved', { disabledVersions: ['unresolved'] }, 'DS-STATE-1@main-installed-unresolved')).toMatchObject({ pass: true });
        // UX-P3.2: a first Browse search is the bar alone, no skeleton (rows first under it are P5.9a, D56).
        expect(line('main-browse-loading', { testIds: ['browse-progress'] }, 'DS-STATE-1@main-browse-loading')).toMatchObject({ pass: true, value: 'present: browse-progress; missing: none' });
        // A popup error is a row of its own: no banner is asked of it (UX-P3.2).
        expect(line('main-quicksearch-error', { testIds: ['search-suggestions-error'] }, 'DS-STATE-1@main-quicksearch-error')).toMatchObject({ pass: true, value: 'present: search-suggestions-error; missing: none' });
        expect(line('main-browse-loading', { testIds: ['browse-progress'], rows: 2 }, 'DS-STATE-1@main-browse-loading')).toMatchObject({ pass: false });
        expect(line('main-browse-loading', { progressTop: 150, contentTop: undefined }, 'DS-STATE-2@main-browse-loading')).toMatchObject({ pass: true, value: 'bar at list top; skeleton rows 0, rows 0; rows-first pending P5.9a' });
        expect(line('main-browse-loading', { progressTop: 150, skeletonRows: 3 }, 'DS-STATE-2@main-browse-loading')).toMatchObject({ pass: false });
        expect(line('main-browse-loading', { progressTop: 150, rows: 1, contentTop: 150 }, 'DS-STATE-2@main-browse-loading')).toMatchObject({ pass: false });
        expect(line('main-installed-unresolved', { disabledVersions: [''] }, 'DS-STATE-1@main-installed-unresolved')).toMatchObject({ pass: false });
        expect(line('main-installed-single', {}, 'DS-STATE-1@main-installed-single')).toBeUndefined();

        expect(line('main-installed-revalidating', { progressTop: 150, contentTop: 150, rows: 4, listBusy: true }, 'DS-STATE-2@main-installed-revalidating')).toMatchObject({ pass: true, value: 'bar at list top; rows 4; aria-busy' });
        expect(line('main-installed-revalidating', { progressTop: 200, contentTop: 150, rows: 4, listBusy: true }, 'DS-STATE-2@main-installed-revalidating')).toMatchObject({ pass: false });
        expect(line('main-installed-loading', { progressTop: 149, contentTop: 150, skeletonRows: 3 }, 'DS-STATE-2@main-installed-loading')).toMatchObject({ pass: true });
        expect(line('main-installed-loading', { progressTop: 0, contentTop: 150, skeletonRows: 3 }, 'DS-STATE-2@main-installed-loading')).toMatchObject({ pass: false });
        expect(line('main-installed-loading', { progressTop: 152, contentTop: 150, skeletonRows: 3 }, 'DS-STATE-2@main-installed-loading')).toMatchObject({ pass: false });
        expect(line('main-installed-loading', {}, 'DS-STATE-2@main-installed-loading')).toMatchObject({ pass: false });

        const empty = { textAlign: 'start', paddingLeft: 20, paddingRight: 20, gap: 8, buttons: 1, buttonWidth: 260, width: 300 };
        expect(line('main-installed-empty', { empties: [empty] }, 'DS-STATE-3@main-installed-empty')).toMatchObject({ pass: true });
        expect(line('main-installed-empty', { empties: [{ ...empty, textAlign: 'center' }] }, 'DS-STATE-3@main-installed-empty')).toMatchObject({ pass: false, value: 'text-align center' });
        expect(line('main-installed-empty', { empties: [{ ...empty, buttonWidth: 200 }] }, 'DS-STATE-3@main-installed-empty')).toMatchObject({ pass: false, value: 'button 200 (target 260)' });
        // UX-P3.6: inside a dialog the empty state's inline padding is 0 and the dialog's 16 px inset carries it.
        const inDialog = { textAlign: 'start', paddingLeft: 0, paddingRight: 0, gap: 8, buttons: 0, buttonWidth: undefined, width: 418, dialogInset: 16 };
        expect(line('main-sources-empty', { empties: [inDialog] }, 'DS-STATE-3@main-sources-empty')).toMatchObject({ pass: true, value: 'start, 0/0 in a dialog inset 16, 0 buttons, gap 8 (1)' });
        expect(line('main-sources-empty', { empties: [{ ...inDialog, paddingLeft: 20, paddingRight: 20 }] }, 'DS-STATE-3@main-sources-empty')).toMatchObject({ pass: false, value: 'padding 20/20 in a dialog inset 16 (target 0/0 in 16)' });
        // The sources rows count as rows under the bar.
        expect(line('main-sources-revalidating', { progressTop: 150, contentTop: 150, rows: 1, listBusy: true }, 'DS-STATE-2@main-sources-revalidating')).toMatchObject({ pass: true, value: 'bar at list top; rows 1; aria-busy' });

        const banner = { severity: 'warning', glyphs: ['warning'], buttons: 0, text: 'Unsupported project: too old.' };
        expect(line('main-installed-unsupported', { banners: [banner] }, 'DS-STATE-4@main-installed-unsupported')).toMatchObject({ pass: true });
        expect(line('main-installed-error', { banners: [{ ...banner, severity: 'error' }] }, 'DS-STATE-4@main-installed-error')).toMatchObject({ pass: false, value: 'glyphs warning on error' });
        expect(line('main-installed-unsupported', { banners: [{ ...banner, buttons: 2, text: 'No stop' }] }, 'DS-STATE-4@main-installed-unsupported')).toMatchObject({ pass: false, value: '2 buttons; no full stop: No stop' });

        const role = { role: 'progress', key: '--vscode-progressBar-background', actual: 'rgb(1, 2, 3)', expected: 'rgb(1, 2, 3)' };
        expect(line('main-installed-loading', { roles: [role] }, 'DS-COLOR-1@main-installed-loading')).toMatchObject({ pass: true, value: 'progress = --vscode-progressBar-background' });
        expect(line('main-installed-loading', { roles: [{ ...role, actual: 'rgb(9, 9, 9)' }] }, 'DS-COLOR-1@main-installed-loading')).toMatchObject({ pass: false });
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
        expect(at('main-installed-single', facts({ disabled: [{ label: '[uninstall-selected-button]', reason: 'Select packages first.' }] }), 'DS-STATE-7@main-installed-single')).toMatchObject({ pass: true, status: 'hard' });
        expect(at('main-installed-single', facts({ disabled: [{ label: '[uninstall-selected-button]', reason: '' }, { label: '.nuiget-row-option', reason: 'Implicitly referenced by an SDK.' }] }), 'DS-STATE-7@main-installed-single'))
            .toMatchObject({ pass: false, value: '2 disabled, 0 unselectable (0 under Transitive), 1 without a reason: [uninstall-selected-button]' });
        // A page with nothing disabled is a pass of a universal rule (UX-P2.8a).
        expect(at('main-updates', facts({}), 'DS-STATE-7@main-updates')).toMatchObject({ pass: true, value: '0 disabled', status: 'hard' });
        expect(at('main-installed-details', facts({}), 'DS-STATE-7@main-installed-details')).toMatchObject({ pass: true, value: '0 disabled', status: 'hard' });
        // A muted check mark is a disabled affordance: the row says why in text, or its Transitive group does.
        const muted = (status: string, transitive = false) => ({ label: '.nuiget-row-option', status, transitive });
        expect(at('main-transitive-expanded', facts({ unselectable: [muted('Implicitly referenced by the SDK')] }), 'DS-STATE-7@main-transitive-expanded'))
            .toMatchObject({ pass: true, value: '0 disabled, 1 unselectable (0 under Transitive), 0 without a reason' });
        expect(at('main-transitive-expanded', facts({ unselectable: [muted('')] }), 'DS-STATE-7@main-transitive-expanded'))
            .toMatchObject({ pass: false, value: '0 disabled, 1 unselectable (0 under Transitive), 1 without a reason: .nuiget-row-option' });
        expect(at('main-transitive-expanded', facts({ unselectable: [muted('', true)] }), 'DS-STATE-7@main-transitive-expanded'))
            .toMatchObject({ pass: true, value: '0 disabled, 1 unselectable (1 under Transitive), 0 without a reason' });
        expect(at('main-installed-single', facts({ disabled: [{ label: '[uninstall-selected-button]', reason: 'Select packages to uninstall them together.' }] }), 'DS-STATE-7@main-installed-single'))
            .toMatchObject({ pass: true });
    });

    it('compares a state\'s elements with its artboard spec within 1 px at the spec\'s width, scope by scope (helper 8, UX-P0.13, UX-P2.8a)', () => {
        const element = (x: number, y: number, w: number, h: number, padding = '0px 0px 0px 0px'): SpecElement => ({ rect: { x, y, w, h }, inset: x, padding, gap: 'normal normal' });
        const spec: SpecLook = {
            'project-selector': { ...element(600, 8, 150, 26), tokens: ['--nuiget-inset'] },
            'installed-list': element(0, 147, 327, 656),
            'package-row-first': element(0, 175, 327, 72, '0px 6px 0px 16px'),
            'section-header-transitive': element(0, 1200, 327, 28),
            'uninstall-selected-button': element(164, 117, 147, 26),
            'row-action-uninstall': { ...element(299, 200, 22, 22), composed: 'main-details-readme' },
            'package-details-panel': element(328, 77, 604, 726),
            'uninstall-button': { ...element(560, 130, 80, 26), composed: 'main-details-readme' },
            'readme-content': { ...element(328, 242, 604, 561), composed: 'main-details-readme' },
        };
        const list = { 'installed-list': element(0, 147, 327, 656), 'package-row-first': element(0, 175, 327, 72), 'uninstall-selected-button': element(164, 117, 147, 26) };
        const at = (scope: string, testIds: Record<string, SpecElement>, given: SpecLook | undefined = spec, width = 932) =>
            measureLines('main-installed-single', layout({ testIds }), 'modern', {}, undefined, width, given).find(line => line.name === `SPEC@main-installed-single/${scope}`);
        // Within 1 px, tokens not compared.
        expect(at('header', { 'project-selector': element(600.5, 8, 150, 26) })).toMatchObject({ pass: true, status: 'hard', value: '1/1 within 1' });
        // A header id off by 2 is named, and missing is never a pass.
        expect(at('header', { 'project-selector': element(602, 8, 150, 26) })).toMatchObject({ pass: false, value: '0/1 within 1; off: project-selector Δx 2 Δinset 2' });
        expect(at('header', {})).toMatchObject({ pass: false, value: '0/1 within 1; missing: project-selector' });
        // A padding off is named on a control; a row's strings are not compared, its rect is.
        expect(at('header', { 'project-selector': element(600, 8, 150, 26, '2px 0px 0px 0px') })).toMatchObject({ pass: false, value: '1/1 within 1; style: project-selector padding 2px 0px 0px 0px (spec 0px 0px 0px 0px)' });
        // A composed id outside its state and a below-the-fold id are not required; the row's padding differs and passes.
        expect(at('list', list)).toMatchObject({ pass: true, status: 'hard', value: '3/3 within 1; composed (main-details-readme): row-action-uninstall; below the fold: section-header-transitive' });
        expect(at('list', { ...list, 'package-row-first': element(0, 247, 327, 72) })).toMatchObject({ pass: false, value: expect.stringContaining('off: package-row-first Δy 72') });
        // An id a later item owns prints and leaves the verdict.
        expect(at('list', { ...list, 'uninstall-selected-button': element(164, 117, 145.6, 26) })).toMatchObject({ pass: true, value: expect.stringContaining('pending P3.11: uninstall-selected-button Δw -1.4') });
        // The later scopes print on their owners.
        // UX-P3.3b: the panel's own offset is the sash's (P3.9); a child inside it is read relative to it.
        expect(at('details', { 'package-details-panel': element(330.2, 77, 601.8, 726) })).toMatchObject({ pass: true, status: 'hard', value: '0/0 within 1; composed (main-details-readme): uninstall-button; pending P3.9: package-details-panel Δx 2.2 Δw -2.2 Δinset 2.2' });
        const withEmpty: SpecLook = { ...spec, 'details-empty': element(328, 77, 604, 60) };
        expect(at('details', { 'package-details-panel': element(331, 77, 601, 726), 'details-empty': element(331, 77, 601, 60) }, withEmpty))
            .toMatchObject({ pass: true, value: '1/1 within 1 (x and inset relative to package-details-panel, pending P3.9); composed (main-details-readme): uninstall-button; pending P3.9: package-details-panel Δx 3 Δw -3 Δinset 3' });
        expect(at('details', { 'package-details-panel': element(331, 77, 601, 726), 'details-empty': element(331, 85, 601, 60) }, withEmpty))
            .toMatchObject({ pass: false, value: expect.stringContaining('off: details-empty Δy 8') });
        // A header control lies across the panel's x range but above it: never read relative to the panel (UX-P3.3b fix-forward).
        const header = { ...withEmpty, 'project-selector': { ...element(862, 8, 157, 26), tokens: ['--nuiget-inset'] } };
        expect(at('header', { 'project-selector': element(862, 8, 157, 26), 'package-details-panel': element(331, 77, 601, 726) }, header))
            .toMatchObject({ pass: true, value: '1/1 within 1' });
        expect(at('readme', {})).toMatchObject({ status: 'hard', value: 'composed (main-details-readme): readme-content' });
        // A capture without a spec for its theme and width is never a pass; another width does not apply.
        expect(measureLines('main-installed-single', layout({ testIds: {} }), 'modern', {}, undefined, 932, undefined).find(line => line.name === 'SPEC@main-installed-single/header')).toMatchObject({ pass: false, value: "not measurable (no artboard spec for this capture's theme and width)" });
        expect(at('header', {}, spec, 800)).toBeUndefined();
        // UX-P2.fix-8: each state at its artboard's width. main-installed-single's 1200 cells print no SPEC line; a round-3
        // transitive state at 1200 prints its four scopes, header and list hard since the reading run; transitive-details is a
        // details id (no list entry, and the details scope names it).
        const specOf = (state: string, width: number, given: SpecLook | undefined = spec) =>
            measureLines(state, layout({ testIds: {} }), 'modern', {}, undefined, width, given).filter(line => line.name.startsWith(`SPEC@${state}/`));
        expect(specOf('main-installed-single', 1200)).toEqual([]);
        for (const state of ['main-transitive-expanded', 'main-transitive-details']) {
            expect(specOf(state, 1200).map(line => line.name)).toEqual(['header', 'list', 'details', 'readme'].map(scope => `SPEC@${state}/${scope}`));
            expect(specOf(state, 1200).filter(line => /\/(header|list)$/.test(line.name)).map(line => line.status)).toEqual(['hard', 'hard']);
            expect(specOf(state, 932)).toEqual([]);
        }
        // UX-P3.1a: main-updates at 1200 against its round-3 page, header and list hard since the item's closing commit.
        expect(specOf('main-updates', 1200).map(line => line.name)).toEqual(['header', 'list', 'details', 'readme'].map(scope => `SPEC@main-updates/${scope}`));
        expect(specOf('main-updates', 1200).filter(line => /\/(header|list)$/.test(line.name)).map(line => line.status)).toEqual(['hard', 'hard']);
        expect(specOf('main-updates', 932)).toEqual([]);
        const transitiveSpec: SpecLook = { 'transitive-details': element(420, 77, 780, 726) };
        const lines = measureLines('main-transitive-details', layout({ testIds: { 'transitive-details': element(420, 77, 780, 726) } }), 'modern', {}, undefined, 1200, transitiveSpec);
        expect(lines.find(line => line.name === 'SPEC@main-transitive-details/details')).toMatchObject({ value: '1/1 within 1' });
        expect(lines.find(line => line.name === 'SPEC@main-transitive-details/list')?.value).not.toContain('transitive-details');
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
        expect(measureLines('main-installed-single', layout(), 'modern', {}, undefined, 220).find(line => line.name === 'PF-6@main-installed-single')).toMatchObject({ status: 'hard' });
        expect(measureLines('main-installed-single', layout(), 'modern', {}, undefined, 400).find(line => line.name === 'PF-6@main-installed-single')).toMatchObject({ status: 'hard' });
        expect(measureLines('main-installed-single', layout(), 'modern', {}, undefined, 600).find(line => line.name === 'PF-6@main-installed-single')).toMatchObject({ status: 'hard' });
        const hits = layout({}, { iconButtons: [iconButton(), iconButton({ inHeader: true, width: 20, height: 20 })] });
        expect(lineOf('sidebar-sections', hits, 'DS-HEIGHT-8@sidebar-sections')).toMatchObject({ pass: true, status: 'hard', value: 'painted 22×22 (target 22×22); section header 20×20 (target 20×20); hit 24 ×2 (at least 24)' });
        expect(measureLines('main-installed-single', layout(), 'modern', {}, undefined, 400).find(line => line.name === 'DS-OVERFLOW-3@main-installed-single/toolbars')).toMatchObject({ status: 'hard' });
    });

    it('holds the headers and the badges to the workbench (UX-P2.6)', () => {
        const badge = (overrides: Partial<Heights['badges'][number]> = {}): Heights['badges'][number] => ({ count: true, width: 20, height: 20, fontSize: '10px', padding: '4px 6px 4px 6px', radius: '9999px', ...overrides });
        expect(lineOf('main-installed-single', layout({}, { badges: [badge()] }), 'DS-HEIGHT-10@main-installed-single')).toMatchObject({ pass: true, status: 'hard' });
        expect(lineOf('main-installed-single', layout({}, { badges: [badge({ width: 17, height: 17 })] }), 'DS-HEIGHT-10@main-installed-single')).toMatchObject({ pass: false });
        expect(lineOf('main-quicksearch-open', layout({}, { badges: [badge()] }), 'DS-HEIGHT-10@main-quicksearch-open')).toBeUndefined();
        // DS-RADIUS-2's badge clause, against the look's tokens.
        const banded = (radius: string) => {
            const built = layout({ endOfP0: { ...layout().endOfP0, fonts: { root: 'sans', others: [] }, lookTokens: { '--nuiget-radius-row': '4px', '--nuiget-radius-badge': '9999px', '--nuiget-radius-label-badge': '9999px' }, rows: [{ state: 'rest', compact: false, radius: '4px', lineWidth: 0, focusPainted: 0, background: '', listFocused: false, multi: false, check: undefined, checkOff: false } as never] } as Layout['endOfP0'] });
            return { ...built, heights: { ...built.heights, badges: [badge(), badge({ count: false, radius })] } };
        };
        expect(lineOf('main-installed-single', banded('9999px'), 'DS-RADIUS-2@main-installed-single/rows')).toMatchObject({ pass: true, value: expect.stringContaining('count badge 9999px (target 9999px); label badge 9999px (target 9999px)') });
        expect(lineOf('main-installed-single', banded('4px'), 'DS-RADIUS-2@main-installed-single/rows')).toMatchObject({ pass: false });
        const inset = { start: 16, end: 16, top: 4, bottom: 4 };
        const box = { above: undefined, below: undefined };
        const headers = (name: string, built: Layout) => lineOf(name, built, `DS-INSET-2@${name}/headers`);
        const direct = (insets: Partial<typeof inset>, trailingEnd: number | undefined, paddingEnd = 16) => layout({ sections: [{ id: 'direct', variant: 'group', insets: { ...inset, top: 6, bottom: 6, ...insets }, trailingEnd, paddingEnd, ...box }] });
        expect(headers('main-installed-single', direct({ end: 23 }, 16))).toMatchObject({ pass: true, status: 'hard', value: 'direct 16/16 6/6' });
        expect(headers('main-installed-single', direct({ end: 23 }, 10))).toMatchObject({ pass: false });
        expect(headers('main-installed-single', direct({ end: 258.3 }, undefined))).toMatchObject({ pass: true, value: 'direct 16/16 (pad 16) 6/6' });
        expect(headers('main-installed-single', direct({ end: 258.3 }, undefined, 20))).toMatchObject({ pass: false });
        // The 400 cell: a clipped title's range reaches past the box; the trailing element holds.
        expect(headers('main-installed-single', direct({ end: 0.4 }, 16))).toMatchObject({ pass: true });
        // A level box outside a list is no group header.
        expect(headers('main-installed-single', layout({ sections: [{ id: 'direct', variant: 'group', insets: inset, trailingEnd: 16, ...box }, { id: 'loose', variant: 'level', insets: { ...inset, start: 2 }, ...box }] }))).toMatchObject({ pass: true, value: 'direct 16/16 4/4' });
        const mainHeaderEnd = (end: number) => layout({ mainHeader: { start: 16, end, top: 8, bottom: 8 } });
        expect(lineOf('main-installed-single', mainHeaderEnd(16), 'DS-INSET-3@main-installed-single/main-header')).toMatchObject({ pass: true, status: 'hard', value: 'header end 16 (target 16)' });
        expect(lineOf('main-installed-single', mainHeaderEnd(35.5), 'DS-INSET-3@main-installed-single/main-header')).toMatchObject({ pass: false, value: 'header end 35.5 (target 16)' });
        expect(headers('main-updates', layout({ flatList: true }))).toMatchObject({ pass: true, value: 'no group header (flat list)' });
        expect(headers('main-updates', layout())).toMatchObject({ pass: false, value: 'not measurable' });

        // UX-P2.6b. DS-TYPE-5: the pane-header type on group headers, 13/600/none on a level; uppercase under the setting.
        const titled = (variant: string, fontSize: string, fontWeight: string, textTransform: string, uppercaseHeaders = false) => {
            const built = layout({ sections: [{ id: 'direct', variant, insets: undefined, above: undefined, below: undefined, hasTitle: true, title: { fontSize, fontWeight, textTransform } }] });
            return { ...built, endOfP0: { ...built.endOfP0, uppercaseHeaders } };
        };
        const type5 = (built: Layout) => lineOf('main-installed-single', built, 'DS-TYPE-5@main-installed-single/headers');
        expect(type5(titled('group', '12px', '600', 'capitalize'))).toMatchObject({ pass: true, status: 'hard', value: 'group ×1: 12px/600/capitalize (target 12px/600/capitalize)' });
        expect(type5(titled('group', '13px', '400', 'none'))).toMatchObject({ pass: false, value: expect.stringContaining('off: direct 13px/400/none') });
        expect(type5(titled('group', '12px', '600', 'uppercase', true))).toMatchObject({ pass: true });
        expect(type5(titled('level', '13px', '600', 'none'))).toMatchObject({ pass: true });
        // DS-COPY-5: one count style per surface.
        const copy5 = (built: Layout) => lineOf('main-installed-single', built, 'DS-COPY-5@main-installed-single');
        const counted = (titleText: string, tabText = 'Installed 15') => layout({ sections: [{ id: 'direct', variant: 'group', insets: undefined, above: undefined, below: undefined, titleText, countBadges: 1 }] }, { tabs: [{ id: 'installed-tab', selected: true, colour: '', lineWidth: 1, lineColour: '', text: tabText, countBadges: 1 }] });
        expect(copy5(counted('Direct packages'))).toMatchObject({ pass: true, status: 'hard', value: 'headers 1: count badges 1, "(N)" texts 0; tabs 1: count badges 1' });
        expect(copy5(counted('Direct packages (3)'))).toMatchObject({ pass: false });
        expect(copy5(counted('Direct packages', 'Installed (3)'))).toMatchObject({ pass: false });
        // UX-P3.3a: a details dependency group is a `level` box; its count is a badge, never "(N)" in its title.
        const level = (titleText: string, countBadges: number) => layout({ sections: [{ id: 'dependencies-.netstandard1.3', variant: 'level', insets: undefined, above: undefined, below: undefined, titleText, countBadges }] });
        expect(lineOf('main-installed-details', level('.NETStandard1.3 (6)', 0), 'DS-COPY-5@main-installed-details')).toMatchObject({ pass: false, value: 'headers 1: count badges 0, "(N)" texts 1' });
        expect(lineOf('main-installed-details', level('.NETStandard1.3', 1), 'DS-COPY-5@main-installed-details')).toMatchObject({ pass: true, status: 'hard', value: 'headers 1: count badges 1, "(N)" texts 0' });
        expect(lineOf('main-browse-results', layout({ browsing: true }), 'DS-COPY-5@main-browse-results')).toMatchObject({ pass: true, value: 'no header; tab strip not shown (browsing)' });
        // DS-DIVIDER-1 headers: the first level-1 group unlined, later ones lined, nested levels unlined.
        const divider = (first: boolean, second: boolean) => layout({ sections: [
            { id: 'direct', variant: 'group', insets: undefined, above: undefined, below: undefined, inList: true, level: 1, posInSet: 1, lineAbove: first },
            { id: 'transitive', variant: 'group', insets: undefined, above: undefined, below: undefined, inList: true, level: 1, posInSet: 2, lineAbove: second },
            { id: 'transitive-net8.0', variant: 'level', insets: undefined, above: undefined, below: undefined, inList: true, level: 2, posInSet: 1, lineAbove: false },
        ] });
        const divide = (built: Layout) => lineOf('main-transitive-expanded', built, 'DS-DIVIDER-1@main-transitive-expanded/headers');
        expect(divide(divider(false, true))).toMatchObject({ pass: true, status: 'hard', value: 'group rows 3: first unlined, 1 lined, 1 level row unlined' });
        expect(divide(divider(true, true))).toMatchObject({ pass: false });
        expect(divide(divider(false, false))).toMatchObject({ pass: false });
        expect(lineOf('main-updates', layout({ flatList: true }), 'DS-DIVIDER-1@main-updates/headers')).toMatchObject({ pass: true, value: 'no group header (flat list)' });
        // DS-TYPE-8 and DS-HC-1 on the badges.
        expect(lineOf('sidebar-sections', layout({}, { badges: [badge()] }), 'DS-TYPE-8@sidebar-sections')).toMatchObject({ pass: true, status: 'hard', value: 'badges 1: 10px (target 10px)' });
        expect(lineOf('sidebar-sections', layout({}, { badges: [badge({ fontSize: '12px' })] }), 'DS-TYPE-8@sidebar-sections')).toMatchObject({ pass: false });
        const contrast = (overrides: Partial<Heights['badges'][number]>, line = 'rgb(111, 195, 223)') => {
            const built = layout({}, { badges: [badge(overrides)] });
            return { ...built, endOfP0: { ...built.endOfP0, contrastBorder: line } };
        };
        const hc = (built: Layout) => lineOf('main-installed-single', built, 'DS-HC-1@main-installed-single');
        expect(hc(contrast({}, ''))).toMatchObject({ pass: true, status: 'hard', value: 'not a high-contrast theme' });
        expect(hc(contrast({ borderWidth: 1, borderColor: 'rgb(111, 195, 223)' }))).toMatchObject({ pass: true, value: 'badges 1: 1 px contrastBorder ×1' });
        expect(hc(contrast({ borderWidth: 0, borderColor: 'rgb(111, 195, 223)' }))).toMatchObject({ pass: false });
        expect(hc(contrast({ borderWidth: 1, borderColor: 'rgb(1, 1, 1)', toned: true }))).toMatchObject({ pass: true, value: 'badges 1: 1 px contrastBorder ×0; toned 1 px ×1' });
        // DS-GRID-2b on border boxes.
        const grid = (above: number, below: number) => layout({ sections: [{ id: 'direct', variant: 'group', insets: undefined, above, below }] });
        expect(lineOf('main-installed-single', grid(0, 0), 'DS-GRID-2b@main-installed-single')).toMatchObject({ pass: true, status: 'hard', value: 'direct 0/0' });
        expect(lineOf('main-installed-single', grid(4, 8), 'DS-GRID-2b@main-installed-single')).toMatchObject({ pass: false });

        // UX-P2.7a. DS-GRID-1's slots and classic badges.
        const ramp = (slots: Layout['slots'], classicBadges = 0) => layout({ examined: 10, slots, classicBadges });
        const select = { label: '[project-selector]', value: 22, overlay: 16, rest: 6, onRamp: true, field: false };
        expect(lineOf('main-installed-single', ramp([select], 8), 'DS-GRID-1@main-installed-single')).toMatchObject({ pass: true, status: 'hard', value: '0 off-ramp; slots [project-selector] 22 (16 + 6); classic count badges 8 at 3/5' });
        expect(lineOf('main-installed-filter', ramp([{ label: '[search-input]', value: 48, overlay: 48, rest: 0, onRamp: true, field: true }]), 'DS-GRID-1@main-installed-filter')).toMatchObject({ pass: true, value: '0 off-ramp; slots [search-input] 48 (2 × 24 + 0)' });
        expect(lineOf('main-installed-single', ramp([{ ...select, value: 21, rest: 5, onRamp: false }]), 'DS-GRID-1@main-installed-single')).toMatchObject({ pass: false });
        // DS-INSET-2 main-header.
        const headerInsets = (top: number, bottom: number) => layout({ mainHeader: { start: 16, end: 16, top, bottom } });
        expect(lineOf('main-installed-single', headerInsets(8, 8), 'DS-INSET-2@main-installed-single/main-header')).toMatchObject({ pass: true, status: 'hard', value: '16/16 8/8' });
        expect(lineOf('main-installed-single', headerInsets(11, 8), 'DS-INSET-2@main-installed-single/main-header')).toMatchObject({ pass: false });
        // DS-TYPE-7, DS-TYPE-9 and DS-DIVIDER-4.
        const shell = (overrides: Partial<Layout['endOfP0']>) => { const built = layout(); return { ...built, endOfP0: { ...built.endOfP0, ...overrides } }; };
        const blank = { details: undefined, dialog: undefined };
        expect(lineOf('main-installed-single', shell({ titles: { panel: { fontSize: '13px', fontWeight: '600' }, ...blank } }), 'DS-TYPE-7@main-installed-single')).toMatchObject({ pass: true, status: 'hard', value: 'panel 13px/600 (target 13px/600)' });
        expect(lineOf('main-installed-single', shell({ titles: { panel: { fontSize: '13px', fontWeight: '700' }, ...blank } }), 'DS-TYPE-7@main-installed-single')).toMatchObject({ pass: false });
        expect(lineOf('main-installed-details', shell({ titles: { panel: { fontSize: '13px', fontWeight: '600' }, details: { fontSize: '18px', fontWeight: '700' }, dialog: undefined } }), 'DS-TYPE-7@main-installed-details')).toMatchObject({ pass: false, status: 'hard' });
        expect(lineOf('main-installed-single', shell({ headings: [{ tag: 'h1', weight: '600', sectionTitle: false }] }), 'DS-TYPE-9@main-installed-single')).toMatchObject({ pass: true, status: 'hard', value: 'headings 1: h1 600' });
        expect(lineOf('main-installed-single', shell({ headings: [{ tag: 'h2', weight: '700', sectionTitle: false }] }), 'DS-TYPE-9@main-installed-single')).toMatchObject({ pass: false, value: expect.stringContaining('off: h2 700') });
        const line = 'rgb(43, 43, 43)';
        expect(lineOf('main-installed-single', shell({ dividers: { key: line, header: line, tabStrips: [line], groupLines: [] } }), 'DS-DIVIDER-4@main-installed-single')).toMatchObject({ pass: true, status: 'hard', value: `header ${line}, tab strips ${line}, group lines none = settings.headerBorder ${line}` });
        expect(lineOf('main-installed-single', shell({ dividers: { key: line, header: 'rgb(49, 49, 49)', tabStrips: [line], groupLines: [] } }), 'DS-DIVIDER-4@main-installed-single')).toMatchObject({ pass: false });
    });
});
