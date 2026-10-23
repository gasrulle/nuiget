import { describe, expect, it } from 'vitest';
import { appliesTo, COLLECT_LAYOUT, elementGroups, formatLine, type Heights, type Layout, MEASURE_WIDGETS, measureLines, parseColour, RAMP, RULES, type Scope, stateGroup, TOLERANCES, WORKBENCH_WIDGETS } from '../ui/v2/measure';
import { STATES } from '../ui/v2/states';

/**
 * UX-P0.10 and UX-P0.11: the measurement registry of `src/test/ui/v2/measure.ts`. The rules run only in the UI job
 * (inside VS Code); this test holds their statuses, the line format and the verdicts on hand-built layouts on every push.
 */
const noHeights: Heights = {
    headers: [], compactRows: [], comfortableRows: [], comfortablePitches: [], tabStrip: undefined, detailsTabs: undefined, buttons: [], inputs: [],
    iconButtons: [], checkBoxes: [], checkSelect: { fill: '', border: '' }, badges: [], progress: [],
};

const layout = (overrides: Partial<Layout> = {}, heights: Partial<Heights> = {}): Layout => ({
    root: true, examined: 0, offRamp: [], offRampCount: 0, blockGaps: [], sections: [], toolbars: [], mainHeader: undefined,
    sidebarHeader: undefined, mainLefts: {}, mainRegionLeft: undefined, details: undefined, sidebar: undefined,
    centring: [], detailsButtons: { uninstall: undefined, update: undefined }, ...overrides, heights: { ...noHeights, ...heights },
});

const lineOf = (state: string, built: Layout, name: string, look: 'modern' | 'classic' = 'modern', workbench = {}) =>
    measureLines(state, built, look, workbench).find(line => line.name === name);

const at16 = { title: 16, search: 16, tab: 16, toolbar: 16, section: 16, row: 16 };

const asGrid1 = { 'main-updates': { pending: 'P3.1b' }, browse: { pending: 'P3.2' }, details: { pending: 'P3.3b' }, dialogs: { pending: 'P3.5' }, sources: { pending: 'P3.6' }, sidebar: { pending: 'P3.7a' } };

/** A state of each group, by its name (no sources state is named yet; `stateGroup` files one by its prefix). */
const STATE_OF: Record<string, string> = {
    'main-installed': 'main-installed-single', 'main-updates': 'main-updates', browse: 'main-browse-results', details: 'main-installed-details',
    dialogs: 'main-installed-bulk-dialog', sources: 'main-sources-list', sidebar: 'sidebar-sections',
};

/** Every named state and a loading state of each group no item names yet (DS-HEIGHT-11's later scopes). */
const CANDIDATES = [...STATES.map(state => state.name), 'main-sources-list', 'main-updates-loading', 'main-browse-loading', 'main-loading-details', 'sidebar-loading'];

describe('the measurement rules (UX-P0.10, UX-P0.11)', () => {
    it('writes D34\'s tolerances and the ramp once', () => {
        expect(TOLERANCES).toEqual({ coincide: 1, gapMembership: 0.5, proximity: 2, height: 1, centring: 1, parity: 1 });
        expect(RAMP).toEqual([0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40]);
    });

    it('keeps PF-3b, PF-5 and PF-6 hard and every other rule pending on its Appendix B item', () => {
        expect(RULES.map(rule => rule.id)).toEqual([
            'PF-6', 'DS-GRID-1', 'DS-GRID-2a', 'DS-GRID-2b', 'DS-INSET-1', 'DS-INSET-2', 'PF-3b', 'PF-5',
            ...Array.from({ length: 11 }, (_, i) => `DS-HEIGHT-${i + 1}`),
        ]);
        const scopes = (id: string): unknown => RULES.find(rule => rule.id === id)?.scopes;
        expect(scopes('PF-6')).toEqual({ 'main-installed': 'hard' });
        expect(scopes('DS-GRID-1')).toEqual({ 'main-installed': { pending: 'P2.7' }, ...asGrid1 });
        expect(scopes('DS-GRID-2a')).toEqual({ 'main-installed': { pending: 'P2.7' }, ...asGrid1 });
        expect(scopes('DS-GRID-2b')).toEqual({ 'main-installed': { pending: 'P2.6' }, ...asGrid1 });
        expect(scopes('DS-INSET-1')).toEqual({ 'main-installed': { pending: 'P2.7' }, details: { pending: 'P3.3b' }, sidebar: { pending: 'P3.7a' } });
        expect(scopes('DS-INSET-2')).toEqual({ toolbars: { pending: 'P2.5' }, headers: { pending: 'P2.6' }, 'main-header': { pending: 'P2.7' }, sidebar: { pending: 'P3.7a' } });
        // UX-P0.11: PF-3b and PF-5 hard where P9.fix-3 and P9.fix-5 measured; the heights pending on Appendix B's items.
        const main = (item: string) => ({ 'main-installed': { pending: item }, 'main-updates': { pending: item }, browse: { pending: item }, details: { pending: item } });
        expect(scopes('PF-3b')).toEqual({ 'main-installed': 'hard', 'main-updates': 'hard' });
        expect(RULES.find(rule => rule.id === 'PF-3b')?.states).toEqual(['main-installed-single', 'main-updates']);
        expect(scopes('PF-5')).toEqual({ details: 'hard' });
        expect(RULES.find(rule => rule.id === 'PF-5')?.states).toEqual(['main-installed-details']);
        // The tracker's state group for DS-HEIGHT-1 and -2 is the sidebar.
        expect(scopes('DS-HEIGHT-1')).toEqual({ sidebar: { pending: 'P3.7a' } });
        expect(scopes('DS-HEIGHT-2')).toEqual({ sidebar: { pending: 'P3.7a' } });
        expect(scopes('DS-HEIGHT-3')).toEqual(main('P2.2'));
        expect(scopes('DS-HEIGHT-4')).toEqual(main('P2.5'));
        expect(scopes('DS-HEIGHT-5')).toEqual({ details: { pending: 'P3.3b' } });
        expect(scopes('DS-HEIGHT-6')).toEqual({ 'main-installed': { pending: 'P2.3' }, 'main-updates': { pending: 'P2.3' }, details: { pending: 'P2.3' }, dialogs: { pending: 'P2.3' }, sources: { pending: 'P2.3' } });
        expect(scopes('DS-HEIGHT-7')).toEqual({ ...main('P2.4'), dialogs: { pending: 'P2.4' }, sources: { pending: 'P2.4' }, sidebar: { pending: 'P2.4' } });
        expect(scopes('DS-HEIGHT-8')).toEqual({ ...main('P2.5'), sources: { pending: 'P2.5' }, sidebar: { pending: 'P2.5' } });
        expect(scopes('DS-HEIGHT-9')).toEqual({ ...main('P2.3'), dialogs: { pending: 'P2.3' }, sources: { pending: 'P2.3' } });
        expect(scopes('DS-HEIGHT-10')).toEqual({ ...main('P2.6'), sidebar: { pending: 'P2.6' } });
        expect(scopes('DS-HEIGHT-11')).toEqual({ 'main-installed': { pending: 'P2.8b' }, 'main-updates': { pending: 'P3.10' }, browse: { pending: 'P3.10' }, details: { pending: 'P3.10' }, sidebar: { pending: 'P3.10' } });
        // Each rule's tolerance is one of D34's.
        expect(Object.fromEntries(RULES.map(rule => [rule.id, rule.tolerance]))).toEqual({
            'PF-6': 1, 'DS-GRID-1': 0.5, 'DS-GRID-2a': 0.5, 'DS-GRID-2b': 2, 'DS-INSET-1': 1, 'DS-INSET-2': 1, 'PF-3b': 1, 'PF-5': 1,
            ...Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`DS-HEIGHT-${i + 1}`, 1])),
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
                const state = CANDIDATES.find(candidate => stateGroup(candidate) === group && appliesTo(rule, candidate)) ?? STATE_OF[group as string];
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
        expect(lines.find(line => line.name === 'PF-3b@main-installed-single')).toMatchObject({ pass: false, value: 'not measurable (no check box or icon in Serilog)' });
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

    it('holds PF-3b to P9.fix-3\'s centring of the check box and the icon within 1 px (helper 4)', () => {
        const rows = (offset: number, icon: number | null = 0) => layout({ centring: [{ name: 'Serilog', row: 100, check: 100.5, icon: icon === null ? undefined : 100 + icon }, { name: 'Moq', row: 180, check: 180 + offset, icon: 180 }] });
        expect(lineOf('main-installed-single', rows(0.5), 'PF-3b@main-installed-single')).toMatchObject({ pass: true, status: 'hard', value: 'check box 0.5 ×2; icon 0 ×2 (centre offsets, 2 rows)' });
        expect(lineOf('main-updates', rows(1.5), 'PF-3b@main-updates')).toMatchObject({ pass: false, status: 'hard' });
        // As P9.fix-3: two rows at least, each with its check box (and here its icon).
        expect(lineOf('main-installed-single', layout(), 'PF-3b@main-installed-single')).toMatchObject({ pass: false, value: 'not measurable (fewer than 2 rows)' });
        expect(lineOf('main-installed-single', layout({ centring: [{ name: 'Moq', row: 10, check: 10, icon: 10 }] }), 'PF-3b@main-installed-single')).toMatchObject({ pass: false, value: 'not measurable (fewer than 2 rows)' });
        expect(lineOf('main-installed-single', rows(0, null), 'PF-3b@main-installed-single')).toMatchObject({ pass: false, value: 'not measurable (no check box or icon in Serilog)' });
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
        expect(lineOf('main-installed-single', rows, 'DS-HEIGHT-3@main-installed-single')).toMatchObject({ pass: false, status: { pending: 'P2.2' }, value: 'rows 78 ×3 (target 72); pitch 79 ×2 (target 72)' });
        expect(lineOf('main-installed-single', layout({}, { comfortableRows: [72, 72], comfortablePitches: [72] }), 'DS-HEIGHT-3@main-installed-single')).toMatchObject({ pass: true });
        // DS-HEIGHT-6: the height, the workbench's button and the computed styles.
        const button = { height: 26, fontSize: '12px', lineHeight: '16px', padding: '4px 8px 4px 8px', radius: '4px' };
        const buttons = layout({}, { buttons: [button, { ...button, height: 24, fontSize: '13px' }] });
        expect(lineOf('main-installed-details', buttons, 'DS-HEIGHT-6@main-installed-details', 'modern', { settingsButton: 26 }))
            .toMatchObject({ pass: false, value: '24, 26 (target 26, workbench 26); fontSize 13px (target 12px)' });
        expect(lineOf('main-installed-details', layout({}, { buttons: [button] }), 'DS-HEIGHT-6@main-installed-details', 'modern', { settingsButton: 26 })).toMatchObject({ pass: true });
        // Without the workbench's value a parity rule cannot pass.
        expect(lineOf('main-installed-details', layout({}, { buttons: [button] }), 'DS-HEIGHT-6@main-installed-details')).toMatchObject({ pass: false, value: '26 (target 26, workbench absent)' });
        // DS-HEIGHT-7 per kind of control.
        const inputs = layout({}, { inputs: [{ kind: 'search', id: 'search-input', height: 24 }, { kind: 'select', id: 'project-selector', height: 26 }, { kind: 'select', id: 'source-selector', height: 26 }] });
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
        const icons = layout({}, { iconButtons: [{ inHeader: false, width: 24, height: 24, hit: { width: 24, height: 24 } }, { inHeader: true, width: 20, height: 20, hit: { width: 24, height: 24 } }] });
        expect(lineOf('sidebar-sections', icons, 'DS-HEIGHT-8@sidebar-sections')).toMatchObject({ pass: false, value: 'painted 24×24 (target 22×22); section header 20×20 (target 20×20); hit 24 ×2 (at least 24)' });
        // The target is a minimum: 23 px fails, whatever the painted box.
        const target = (hit: number) => layout({}, { iconButtons: [{ inHeader: false, width: 22, height: 22, hit: { width: hit, height: hit } }] });
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
        const badges = layout({}, { badges: [{ count: true, width: 19, height: 19, fontSize: '10px', padding: '4px 6px 4px 6px', radius: '9999px' }, { count: false, width: 30, height: 18, fontSize: '11px', padding: '0px 4px 0px 4px', radius: '2px' }] });
        expect(lineOf('main-installed-single', badges, 'DS-HEIGHT-10@main-installed-single')).toMatchObject({ pass: false, value: expect.stringContaining('label fontSize 11px (target 10px)') });
        const modernBadges = layout({}, { badges: [{ count: true, width: 19, height: 19, fontSize: '10px', padding: '4px 6px 4px 6px', radius: '9999px' }, { count: false, width: 40, height: 18, fontSize: '10px', padding: '4px 6px 4px 6px', radius: '9999px' }] });
        expect(lineOf('main-installed-single', modernBadges, 'DS-HEIGHT-10@main-installed-single')).toMatchObject({ pass: true, value: 'count 19×19 (at least 19×19); label 1' });
        expect(lineOf('main-installed-single', badges, 'DS-HEIGHT-10@main-installed-single', 'classic')?.value).toContain('count fontSize 10px (target 11px)');
        // The progress bar only in a loading state.
        expect(lineOf('main-installed-loading', layout({}, { progress: [2] }), 'DS-HEIGHT-11@main-installed-loading')).toMatchObject({ pass: true, status: { pending: 'P2.8b' } });
        expect(lineOf('main-installed-single', layout({}, { progress: [2] }), 'DS-HEIGHT-11@main-installed-single')).toBeUndefined();
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
});
