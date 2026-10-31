// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COLLECT_LAYOUT, type Layout, type LookMeasure, MEASURE_LOOK, MEASURE_WIDGETS, RAMP, TOLERANCES, type WidgetMeasure } from '../ui/v2/measure';

/**
 * UX-P0.10 and UX-P0.11: the in-page collector of `src/test/ui/v2/measure.ts` on a page with stubbed geometry. jsdom
 * has no layout: an element's rectangle is its `data-rect` ("left,top,right,bottom") and a text node's is its parent's
 * `data-text`. Computed styles come from jsdom's cascade of the page's `<style>`, so every rule the collector reads is
 * declared. The geometry in Chromium is proved by the UI job's `[measure]` lines; this test holds the logic on every push.
 */
type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number; x: number; y: number };
const rect = (spec: string | undefined): Rect => {
    const [left, top, right, bottom] = (spec ?? '0,0,0,0').split(',').map(Number);
    return { left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top };
};

const STYLE = `
button { background-color: rgba(0, 0, 0, 0); }
.nuiget-button { border: 1px solid rgba(0, 0, 0, 0); background-color: rgb(14, 99, 156); font-size: 13px; padding: 0 12px; }
.nuiget-section-toggle { border: 0; background-color: rgba(0, 0, 0, 0); }
.nuiget-badge { font-size: 11px; padding: 0 4px; }
.nuiget-list { overflow-y: auto; }
.nuiget-section-header { padding: 0 16px; }
.nuiget-row-name { text-overflow: ellipsis; }
`;

const PAGE = `
<main data-testid="nuiget-app" data-rect="0,0,600,700">
  <header data-testid="main-header" data-rect="0,0,600,40"><h1 class="nuiget-main-title" data-rect="16,8,200,32" data-text="16,8,120,32">NuGet</h1></header>
  <div data-testid="tab-bar" data-rect="0,40,600,70"><span data-rect="16,45,80,65" data-text="16,45,70,65">Installed</span><span class="nuiget-badge" data-rect="72,46,87,64" data-text="74,47,85,63">15</span></div>
  <div class="nuiget-list" data-rect="0,70,600,500">
    <div role="toolbar" data-testid="installed-toolbar" data-rect="0,70,600,104">
      <button class="nuiget-button" data-testid="select-all-button" data-rect="16,74,100,100" data-text="29,76,87,98">Select all</button>
      <button class="nuiget-button" data-testid="uninstall-selected-button" data-rect="400,74,594,100" data-text="413,76,581,98">Uninstall selected (0)</button>
    </div>
    <div class="nuiget-section-header" data-testid="section-box-direct" data-variant="group" data-rect="0,110,600,132">
      <h2 data-rect="16,110,584,132"><button class="nuiget-section-toggle" aria-controls="direct-content" data-rect="16,110,584,132">
        <svg data-rect="16,113,32,129"></svg><span class="nuiget-section-title" data-rect="36,113,80,129" data-text="36,113,80,129">Direct</span>
        <span class="nuiget-visually-hidden" data-rect="0,0,1,1" data-text="0,0,900,20">a hidden description</span>
      </button></h2>
    </div>
    <div id="direct-content" data-testid="installed-list" class="nuiget-listbox" role="listbox" data-rect="0,136,590,300">
      <div class="nuiget-row nuiget-row--comfortable" data-row-kind="group" data-rect="0,136,600,158"></div>
      <div class="nuiget-row nuiget-row--comfortable" data-rect="0,136,600,214"><div class="nuiget-row-option" role="option" aria-selected="true" data-rect="0,136,600,213">
        <span class="nuiget-row-check" data-rect="16,167,32,183"></span><span class="nuiget-row-icon" data-rect="40,159,72,191"></span>
        <span class="nuiget-row-name" data-rect="80,150,200,166" data-text="80,150,200,166">Serilog</span>
        <span class="nuiget-badge" data-rect="210,150,240,166" data-text="212,151,238,165">CPM<span class="nuiget-visually-hidden">Central</span></span>
        <span class="nuiget-row-version" data-rect="80,170,120,184" data-text="80,170,120,184">3.1.1</span>
        <span class="nuiget-row-authors" data-rect="80,190,200,204" data-text="80,190,200,204">Serilog Contributors</span>
      </div><div class="nuiget-row-actions" data-rect="560,160,594,190"><button class="nuiget-icon-button" data-rect="566,163,590,187"></button></div></div>
      <div class="nuiget-row nuiget-row--comfortable" data-rect="0,214,600,292"><div class="nuiget-row-option" role="option" data-rect="0,214,600,291">
        <span class="nuiget-row-check" data-rect="16,245,32,261"></span><span class="nuiget-row-icon" data-rect="40,237,72,269"></span>
        <span class="nuiget-row-name" data-rect="80,228,200,244" data-text="80,228,200,244">Moq</span>
      </div></div>
    </div>
    <div class="nuiget-section-header" data-testid="section-box-transitive" data-variant="group" data-rect="0,300,600,322">
      <h2 data-rect="16,300,540,322"><button class="nuiget-section-toggle" aria-controls="transitive-content" data-rect="16,300,540,322">
        <span class="nuiget-section-title" data-rect="36,303,180,319" data-text="36,303,180,319">Transitive packages</span>
      </button></h2>
      <div class="nuiget-section-actions" data-rect="540,303,598,319"><span class="nuiget-badge" data-rect="560,304,598,318"><span aria-hidden="true" data-rect="562,305,596,317" data-text="562,305,596,317">provisional</span><span class="nuiget-visually-hidden">Versions come from the project file</span></span></div>
    </div>
  </div>
  <div data-testid="package-details-panel" data-rect="600,70,900,700">
    <div role="tablist" data-rect="600,70,900,100" data-text="620,75,700,95">Details</div>
    <button class="nuiget-button" data-testid="uninstall-button" data-rect="800,110,880,134" data-text="813,112,867,132">Uninstall</button>
    <button class="nuiget-button" data-testid="install-update-button" data-rect="800,140,880,164" data-text="813,142,867,162">Update</button>
  </div>
</main>`;

const collect = (rootTestId = 'nuiget-app'): Layout =>
    new Function(COLLECT_LAYOUT).apply(null, [rootTestId, RAMP, TOLERANCES.gapMembership, TOLERANCES.containment]) as Layout;

describe('the in-page collector on stubbed geometry (UX-P0.10, UX-P0.11)', () => {
    const saved = {
        rect: Element.prototype.getBoundingClientRect,
        select: Range.prototype.selectNodeContents,
        rects: Range.prototype.getClientRects,
        style: window.getComputedStyle,
    };

    beforeEach(() => {
        document.head.innerHTML = `<style>${STYLE}</style>`;
        document.body.innerHTML = PAGE;
        Element.prototype.getBoundingClientRect = function (this: Element) {
            return rect((this as HTMLElement).dataset?.rect) as DOMRect;
        };
        Range.prototype.selectNodeContents = function (this: Range & { node?: Node }, node: Node) {
            this.node = node;
        };
        Range.prototype.getClientRects = function (this: Range & { node?: Node }) {
            const text = this.node?.parentElement?.dataset.text;
            return (text === undefined ? [] : [rect(text)]) as unknown as DOMRectList;
        };
        // jsdom implements no pseudo-element styles; the element's own style stands in (no ::after widens a target).
        window.getComputedStyle = (element: Element) => saved.style.call(window, element);
    });

    afterEach(() => {
        Element.prototype.getBoundingClientRect = saved.rect;
        Range.prototype.selectNodeContents = saved.select;
        Range.prototype.getClientRects = saved.rects;
        window.getComputedStyle = saved.style;
        document.head.innerHTML = '';
        document.body.innerHTML = '';
    });

    it('a hidden icon leaves its row\'s check box measurable (PF-3b, DS-ROW-6, UX-P2.2)', () => {
        const before = collect().centring[0];
        expect(before.check).toEqual(expect.any(Number));
        expect(before.icon).toEqual(expect.any(Number));
        (document.querySelector('.nuiget-row-option .nuiget-row-icon') as HTMLElement).setAttribute('data-rect', '40,159,40,159');
        const after = collect().centring[0];
        expect(after.check).toEqual(expect.any(Number));
        expect(after.icon).toBeUndefined();
    });

    it('a badge past the end of its line counts as clipped; a whole one does not (DS-ROW-5, UX-P2.2)', () => {
        const name = document.querySelector('.nuiget-row-option .nuiget-row-name') as HTMLElement;
        const badge = document.querySelector('.nuiget-row-option .nuiget-badge') as HTMLElement;
        const line = document.createElement('span');
        line.className = 'nuiget-row-line';
        line.setAttribute('data-rect', '80,150,240,166');
        name.before(line);
        line.append(name, badge);
        expect(collect().rows[0].badgesClipped).toBe(0);
        line.setAttribute('data-rect', '80,150,230,166');
        expect(collect().rows[0].badgesClipped).toBe(1);
    });

    it('reads the row facts of DS-COLOR-2, DS-DIVIDER-1, DS-RADIUS-2 and DS-COLOR-5 (UX-P2.2b)', () => {
        // jsdom does not resolve var(): the probe's colour stays the declaration, which is what these facts compare.
        const focusBorder = 'var(--vscode-focusBorder, transparent)';
        const option = document.querySelector('.nuiget-row-option') as HTMLElement;
        const row = option.closest('.nuiget-row') as HTMLElement;
        const base = collect().endOfP0;
        expect(base.listSelection.active).toBe('var(--vscode-list-activeSelectionBackground, transparent)');
        expect(base.rows[0]).toMatchObject({ lineWidth: 0, focusPainted: 0, multi: false, listFocused: false });
        row.style.borderBottomWidth = '1px';
        row.style.borderBottomStyle = 'solid';
        option.style.setProperty('background-color', focusBorder);
        const painted = collect().endOfP0;
        expect(painted.rows[0].lineWidth).toBe(1);
        expect(painted.rows[0].focusPainted).toBeGreaterThan(0);
        option.tabIndex = 0;
        option.focus();
        const focused = collect().endOfP0;
        expect(focused.rows[0].focusPainted).toBe(0);
        expect(focused.rows[0].listFocused).toBe(true);
        option.blur();
    });

    it('a hidden badge is not counted (DS-ROW-6, UX-P2.2)', () => {
        (document.querySelector('.nuiget-row-option .nuiget-badge') as HTMLElement).style.display = 'none';
        expect(collect().rows[0].badgesShown).toBe(0);
        expect(collect().rows[0].badgesClipped).toBe(0);
    });

    it('a badge inside a collapsed wrapper is not shown; in a wrapper of its width it is (DS-ROW-5, UX-P2.2)', () => {
        const name = document.querySelector('.nuiget-row-name') as HTMLElement;
        const badge = document.querySelector('.nuiget-row-option .nuiget-badge') as HTMLElement;
        const wrapper = document.createElement('span');
        wrapper.style.overflowX = 'hidden';
        wrapper.setAttribute('data-rect', '210,150,240,166');
        name.after(wrapper);
        wrapper.append(badge);
        expect(collect().rows[0].badgesShown).toBe(1);
        wrapper.setAttribute('data-rect', '210,150,210,166');
        expect(collect().rows[0].badgesShown).toBe(0);
    });

    it('measures a toolbar to its painted buttons and leaves hidden text out of a header box', () => {
        const layout = collect();
        expect(layout.root).toBe(true);
        expect(layout.toolbars).toEqual([{ id: 'installed-toolbar', insets: { start: 16, end: 6, top: 4, bottom: 4 } }]);
        // The transparent toggle is a container: the box ends at the title (80), not at the 900 px hidden text.
        expect(layout.sections.find(section => section.id === 'direct')?.insets).toEqual({ start: 16, end: 520, top: 3, bottom: 3 });
    });

    it('measures header proximity on the title line box and the content the header controls', () => {
        const layout = collect();
        // Above: the title top 113 minus the buttons' bottom 100; below: the first row name 150 minus the title bottom 129.
        expect(layout.sections.find(section => section.id === 'direct')).toMatchObject({ above: 13, below: 21 });
        // A collapsed header (its content is absent) labels nothing.
        expect(layout.sections.find(section => section.id === 'transitive')?.below).toBeUndefined();
    });

    it('reads every list that scrolls, its bar\'s thickness and thumb, the root\'s scrollbar-color and the slider token (UX-P0.22)', () => {
        const list = document.querySelector<HTMLElement>('[data-testid="installed-list"]')!;
        list.style.overflowY = 'auto';
        list.style.backgroundColor = 'rgb(30, 30, 30)';
        // A 164 px list of 656 px content, its bar 10 px wide: offsetWidth 590 against clientWidth 580.
        Object.defineProperties(list, { scrollHeight: { value: 656 }, clientHeight: { value: 164 }, offsetWidth: { value: 590 }, clientWidth: { value: 580 } });
        document.documentElement.style.setProperty('--nuiget-color-scrollbar', 'rgba(121, 121, 121, 0.4)');
        try {
            const { scrollbar } = collect();
            expect(scrollbar.scrollers).toEqual([{ label: '[installed-list]', left: 0, top: 136, width: 590, height: 164, right: 590, size: 10, thumb: 41, backdrop: 'rgb(30, 30, 30)' }]);
            expect(scrollbar.slider).toBe('rgba(121, 121, 121, 0.4)');
            expect(typeof scrollbar.rootColor).toBe('string');
        } finally {
            document.documentElement.style.removeProperty('--nuiget-color-scrollbar');
        }
        // A dialog is portaled to the body, outside the root, and scrolls itself: its bar counts too.
        const dialog = document.createElement('div');
        dialog.className = 'nuiget-dialog';
        dialog.dataset.rect = '100,100,400,300';
        dialog.style.overflowY = 'auto';
        Object.defineProperties(dialog, { scrollHeight: { value: 400 }, clientHeight: { value: 200 }, offsetWidth: { value: 300 }, clientWidth: { value: 290 } });
        document.body.append(dialog);
        expect(collect().scrollbar.scrollers.map(scroller => `${scroller.label} ${scroller.size} ${scroller.thumb}`)).toEqual(['[installed-list] 10 41', '.nuiget-dialog 10 100']);
    });

    it('gives a header scrolled out of its list no gaps, and keeps its insets', () => {
        const box = document.querySelector<HTMLElement>('[data-testid="section-box-direct"]') as HTMLElement;
        for (const element of [box, ...box.querySelectorAll<HTMLElement>('[data-rect]')]) {
            element.dataset.rect = rect(element.dataset.rect).left + ',' + (rect(element.dataset.rect).top - 200) + ',' + rect(element.dataset.rect).right + ',' + (rect(element.dataset.rect).bottom - 200);
        }
        for (const element of box.querySelectorAll<HTMLElement>('[data-text]')) {
            element.dataset.text = rect(element.dataset.text).left + ',' + (rect(element.dataset.text).top - 200) + ',' + rect(element.dataset.text).right + ',' + (rect(element.dataset.text).bottom - 200);
        }
        const direct = collect().sections.find(section => section.id === 'direct');
        expect(direct).toMatchObject({ above: undefined, below: undefined });
        expect(direct?.insets?.start).toBe(16);
    });

    it('collects the heights, the computed styles, the centring and the details buttons (helpers 3 and 4)', () => {
        const layout = collect();
        expect(layout.heights).toMatchObject({
            comfortableRows: [78, 78], comfortablePitches: [78], tabStrip: 30, detailsTabs: 30, progress: [],
            buttons: [
                { height: 26, fontSize: '13px', padding: '0px 12px 0px 12px' }, { height: 26, fontSize: '13px' },
                { height: 24, fontSize: '13px' }, { height: 24, fontSize: '13px' },
            ],
        });
        // The badge's own text tells a count from a label; a title in a hidden child does not count.
        expect(layout.heights.badges.map(badge => [badge.count, badge.width, badge.height])).toEqual([[true, 15, 18], [false, 30, 16], [false, 38, 14]]);
        expect(layout.heights.checkBoxes.map(box => [box.width, box.height, box.selected === undefined])).toEqual([[16, 16, false], [16, 16, true]]);
        expect(layout.centring).toEqual([{ name: 'Serilog', row: 175, check: 175, icon: 175 }, { name: 'Moq', row: 253, check: 253, icon: 253 }]);
        expect(layout.detailsButtons).toEqual({ uninstall: { left: 800, height: 24 }, update: { left: 800, height: 24 } });
    });

    it('collects the rows, the chrome, the overflow offenders and the PF-2 and PF-4 edges (helpers 5 and 6)', () => {
        const layout = collect();
        expect(layout.rows.map(row => [row.list, row.compact, row.name, row.nameEllipsis, row.authorsCut, row.versionShown, row.versionCut, row.badgesShown, row.actionsEnd])).toEqual([
            ['installed-list', false, 'Serilog', true, false, true, false, 1, 10], ['installed-list', false, 'Moq', true, undefined, false, false, 0, undefined],
        ]);
        // Authors wider than their box are cut (PF-3a's input).
        const authors = document.querySelector('.nuiget-row-authors') as HTMLElement;
        Object.defineProperty(authors, 'scrollWidth', { value: 150 });
        Object.defineProperty(authors, 'clientWidth', { value: 120 });
        expect(collect().rows[0].authorsCut).toBe(true);
        expect(layout.chrome).toEqual({ 'main-header': { left: 0, top: 0, width: 600, height: 40 }, search: undefined, 'tab-bar': { left: 0, top: 40, width: 600, height: 30 } });
        expect(layout.firstRow).toBe(136);
        // Only section headers are DS-OVERFLOW-2's containers here: the tab label and its count overlapping is not counted.
        // The transitive header's badge reaches past the box's 16 px end padding.
        expect(layout.overflow.containers).toBe(2);
        expect(layout.overflow.collisions).toEqual([]);
        expect(layout.overflow.outside).toEqual(['[section-box-transitive] .nuiget-section-actions 540–598 outside 16–584', '[section-box-transitive] .nuiget-badge 560–598 outside 16–584']);
        expect(layout.overflow.badges).toEqual(['transitive "provisional" 560–598 (box right 600)']);
        expect(layout.sections.find(section => section.id === 'transitive')?.trailingEnd).toBe(2);
        expect(layout.transitiveGap).toEqual({ lastRowBottom: 292, headerTop: 300, sameScroller: true });
        // A tree that holds the Transitive group: the direct rows end at its group row, and no pitch crosses one (UX-P2.1e).
        const sizer = document.querySelector('[data-testid="installed-list"]') as HTMLElement;
        sizer.insertAdjacentHTML('beforeend', '<div class="nuiget-row nuiget-row--comfortable" data-row-kind="group" data-testid="group-row-transitive" data-rect="0,292,600,314"></div><div class="nuiget-row nuiget-row--comfortable" data-rect="0,314,600,392"><div class="nuiget-row-option" role="treeitem" data-rect="0,314,600,391"></div></div>');
        const grouped = collect();
        expect(grouped.transitiveGap?.lastRowBottom).toBe(292);
        expect(grouped.heights.comfortablePitches).toEqual([78]);
        sizer.querySelectorAll('[data-testid="group-row-transitive"], [data-testid="group-row-transitive"] ~ *').forEach(el => el.remove());
        // A tree from before the P0.10 hook (the negative control's 80940aa): the header box is found by P9.fix-2's toggle,
        // here pinned below the list's own scroll port (UX-P0.17); with neither selector PF-2 has nothing to measure.
        const box = document.querySelector('[data-testid="section-box-transitive"]') as HTMLElement;
        box.removeAttribute('data-testid');
        box.dataset.rect = '0,520,600,542';
        (box.querySelector('.nuiget-section-toggle') as HTMLElement).dataset.testid = 'section-header-transitive';
        (document.querySelector('[data-testid="installed-list"]') as HTMLElement).style.overflowY = 'auto';
        document.querySelector('.nuiget-list')?.after(box);
        expect(collect().transitiveGap).toEqual({ lastRowBottom: 292, headerTop: 520, sameScroller: false });
        (box.querySelector('.nuiget-section-toggle') as HTMLElement).removeAttribute('data-testid');
        expect(collect().transitiveGap).toBeUndefined();
        document.body.innerHTML = PAGE;
        // PF-4: the listbox does not scroll itself, so the list's edge is its scroller's (the list column), the listbox's beside it.
        expect(layout.primaryEdges).toEqual([{ list: 'installed-list', button: 594, listRight: 600, listboxRight: 590 }]);
        // MS-8's Browse view and DS-OVERFLOW-6's document sizes (jsdom has no layout: the shape, not the numbers).
        expect(layout.browsing).toBe(false);
        expect(layout.documentOverflow).toMatchObject({ clientWidth: expect.any(Number), clientHeight: expect.any(Number), scrollWidth: expect.any(Number), scrollHeight: expect.any(Number) });
        // A listbox that scrolls itself is its own scroll port.
        (document.querySelector('[data-testid="installed-list"]') as HTMLElement).style.overflowY = 'auto';
        expect(collect().primaryEdges).toEqual([{ list: 'installed-list', button: 594, listRight: 590, listboxRight: 590 }]);
    });

    it('finds what extends the document along the containing-block chain, and the Browse view in place of the tabs', () => {
        const size = (name: string, value: number) => Object.defineProperty(document.documentElement, name, { value, configurable: true });
        size('clientWidth', 600);
        size('clientHeight', 500);
        size('scrollWidth', 600);
        size('scrollHeight', 900);
        try {
            document.body.innerHTML = `
                <main data-testid="nuiget-app" data-rect="0,0,600,500">
                  <div class="nuiget-main-list" data-rect="0,0,600,500"><div class="nuiget-empty" data-rect="0,0,600,40" data-text="16,8,300,24">Press Enter</div></div>
                  <div class="list" style="overflow-y: auto" data-rect="0,40,600,500">
                    <div data-rect="0,40,600,500"><span class="nuiget-visually-hidden" style="position: absolute" data-rect="0,700,1,701">hint</span></div>
                  </div>
                </main>`;
            // An absolutely placed span with no positioned ancestor: the list's overflow does not hold it, so the document grows.
            expect(collect().documentOverflow?.outside).toBe('.nuiget-visually-hidden 0,700 1×1');
            // Under a positioned scroller it is held, and nothing else is past the viewport.
            (document.querySelector('.list') as HTMLElement).style.position = 'relative';
            expect(collect().documentOverflow?.outside).toBeUndefined();
            // The list pane shows the idle Browse view (an empty state), not the Tabs root.
            expect(collect().browsing).toBe(true);
            (document.querySelector('.nuiget-main-list') as HTMLElement).innerHTML = '<div class="nuiget-tabs" data-rect="0,0,600,500"></div>';
            expect(collect().browsing).toBe(false);
        } finally {
            for (const name of ['clientWidth', 'clientHeight', 'scrollWidth', 'scrollHeight']) {
                delete (document.documentElement as unknown as Record<string, unknown>)[name];
            }
        }
    });

    it('collects the facts of the rules registered at the end of P0 (UX-P0.13)', () => {
        const panel = document.querySelector('[data-testid="package-details-panel"]') as HTMLElement;
        panel.insertAdjacentHTML('beforeend', '<dl class="nuiget-details-facts" data-rect="620,200,880,260"><div class="nuiget-details-fact" data-rect="620,200,880,220"><dt data-rect="620,200,690,220" data-text="620,200,680,220">Owner</dt><dd data-rect="700,200,880,220" data-text="700,200,760,220">Microsoft</dd></div><div class="nuiget-details-fact" data-rect="620,230,880,250"><dt data-rect="620,230,690,250" data-text="620,230,670,250">License</dt><dd data-rect="704,230,880,250" data-text="704,230,750,250">MIT</dd></div></dl><p class="nuiget-empty-text" data-rect="620,300,880,320" data-text="620,300,800,320">Select a package</p>');
        const facts = collect().endOfP0;
        expect(facts.rows.map(row => [row.list, row.compact, row.icon?.w, row.nameLeft, row.actions])).toEqual([['installed-list', false, 32, 80, 1], ['installed-list', false, 32, 80, 0]]);
        expect(facts.rows[0].band).toEqual({ left: 0, top: 136, right: 600, bottom: 214 });
        expect(facts.factLefts).toEqual([[700, 704]]);
        expect(facts.copyEnds).toEqual([{ kind: 'empty', text: 'Select a package' }]);
        expect(facts.controlsOut.map(entry => [entry.container, entry.out, entry.total])).toEqual([['toolbars', 0, 2], ['tabs', 0, 0]]);

        // The type, the details header, the list pane, overflow menus and min-content widths.
        document.head.insertAdjacentHTML('beforeend', '<style id="end-of-p0">main, main * { font-family: sans-serif; } main { line-height: 18.2px; } .nuiget-row--compact { line-height: 22px; } .nuiget-row-version, .nuiget-row-authors { font-size: 11px; color: rgb(157, 157, 157); }</style>');
        document.documentElement.style.setProperty('--vscode-descriptionForeground', '#9d9d9d');
        try {
            (document.querySelector('.nuiget-list') as HTMLElement).classList.add('nuiget-main-list');
            const tabBar = document.querySelector('[data-testid="tab-bar"]') as HTMLElement;
            tabBar.insertAdjacentHTML('beforeend', '<button aria-haspopup="menu" data-rect="560,45,580,65"></button><button style="display: none"></button>');
            panel.insertAdjacentHTML('afterbegin', '<div class="nuiget-details-header" data-rect="600,100,900,180"><h2 class="nuiget-details-title" data-rect="620,120,800,140" data-text="620,120,760,140">Serilog</h2></div><div role="tab" data-rect="616,75,680,95" data-text="620,77,670,93">Readme</div>');
            panel.insertAdjacentHTML('beforeend', '<span class="odd" style="font-family: serif" data-rect="620,400,700,420" data-text="620,400,690,420">Odd</span>');
            document.querySelector('.nuiget-list')?.insertAdjacentHTML('beforeend', '<div class="nuiget-row nuiget-row--compact" data-rect="0,300,300,322"><div class="nuiget-row-option" role="option" data-rect="0,300,300,322"><span class="nuiget-row-name" data-rect="20,303,100,319" data-text="20,303,90,319">Polly</span></div></div>');
            const toolbar = document.querySelector('[data-testid="installed-toolbar"]') as HTMLElement;
            Object.defineProperties(toolbar, { scrollWidth: { value: 620, configurable: true }, clientWidth: { value: 600, configurable: true } });
            const more = collect().endOfP0;
            expect(more.listPaneWidth).toBe(600);
            expect(more.detailsHeader).toMatchObject({ insets: { start: 20, top: 20 }, titleLeft: 620, tabLabelLeft: 620 });
            expect(more.controlsOut.find(entry => entry.container === 'tabs')).toMatchObject({ out: 0, hidden: 1, menu: true, total: 2 });
            expect(more.minContent).toEqual({ toolbar: { scroll: 620, client: 600 }, header: { scroll: 0, client: 0 } });
            expect(more.rootLineHeight).toBe(18.2);
            expect(more.compactLineHeights).toEqual([22]);
            expect(more.fonts.others).toEqual(['serif']);
            expect(more.descriptionForeground).toBe('#9d9d9d');
            expect(more.metaText).toEqual([
                { kind: 'meta', fontSize: 11, colour: 'rgb(157, 157, 157)', selected: true },
                { kind: 'meta', fontSize: 11, colour: 'rgb(157, 157, 157)', selected: true },
            ]);
            // Without a menu the hidden tab control is out of reach.
            tabBar.querySelector('[aria-haspopup]')?.remove();
            expect(collect().endOfP0.controlsOut.find(entry => entry.container === 'tabs')).toMatchObject({ out: 1, hidden: 1, menu: false, total: 1 });
        } finally {
            document.getElementById('end-of-p0')?.remove();
            document.documentElement.style.removeProperty('--vscode-descriptionForeground');
        }
    });

    it('collects the size, the weight and the header flag of the visible text, the README and hidden text left out, and the look (UX-P1.1)', () => {
        document.head.insertAdjacentHTML('beforeend', '<style id="type-facts">main { font-size: 13px; font-weight: 400; } .nuiget-section-title { font-size: 11px; font-weight: 700; } .nuiget-row-name { font-weight: 600; } .nuiget-readme, .nuiget-readme * { font-size: 21px; font-weight: 700; }</style>');
        const panel = document.querySelector('[data-testid="package-details-panel"]') as HTMLElement;
        panel.insertAdjacentHTML('beforeend', '<div class="nuiget-readme" data-rect="620,300,880,340"><h1 data-rect="620,300,880,340" data-text="620,300,880,340">A README title</h1></div>');
        document.documentElement.dataset.look = 'modern';
        document.documentElement.style.setProperty('--vscode-extensionIcon-verifiedForeground', '#4daafc');
        document.head.insertAdjacentHTML('beforeend', '<style id="verified-facts">.verified { color: rgb(77, 170, 252); }</style>');
        panel.insertAdjacentHTML('beforeend', '<svg class="verified" data-codicon="verified-filled" data-rect="620,350,632,362"></svg>');
        document.documentElement.style.setProperty('--nuiget-scrollbar-size', '8px');
        try {
            const facts = collect().endOfP0;
            expect(facts.textStyles.length).toBeGreaterThan(0);
            // The README's 21 px and every hidden description stay out; a title and a row name are read.
            expect(facts.textStyles.filter(text => text.fontSize === 21)).toEqual([]);
            expect(facts.textStyles).toContainEqual({ fontSize: 11, fontWeight: 700, header: true });
            expect(facts.textStyles).toContainEqual({ fontSize: 13, fontWeight: 600, header: false });
            // A badge inside a section header is no title: only the title may be 700 (DS-TYPE-3).
            expect(facts.textStyles.filter(text => text.header).every(text => text.fontSize === 11)).toBe(true);
            expect(facts.dataLook).toBe('modern');
            expect(facts.verifiedMarks).toEqual([{ w: 12, h: 12, colour: 'rgb(77, 170, 252)' }]);
            expect(facts.verifiedForeground).toBe('#4daafc');
            expect(facts.lookTokens['--nuiget-scrollbar-size']).toBe('8px');
            expect(Object.keys(facts.lookTokens)).toHaveLength(8);
        } finally {
            document.getElementById('type-facts')?.remove();
            document.getElementById('verified-facts')?.remove();
            document.documentElement.style.removeProperty('--vscode-extensionIcon-verifiedForeground');
            delete document.documentElement.dataset.look;
            document.documentElement.style.removeProperty('--nuiget-scrollbar-size');
        }
        // The missing root's layout has the empty values, so each of the three rules prints not measurable.
        const empty = collect('no-such-root').endOfP0;
        expect(empty).toMatchObject({ textStyles: [], dataLook: undefined, lookTokens: {} });
    });

    it('collects the focused element and its ring and the disabled affordances (UX-P0.14)', () => {
        document.head.insertAdjacentHTML('beforeend', '<style id="p014">.nuiget-button:focus { outline-width: 1px; outline-style: solid; outline-color: rgb(0, 120, 212); outline-offset: 2px; } [role="option"] { outline-width: 1px; outline-style: dotted; outline-color: rgb(243, 133, 24); outline-offset: -1px; }</style>');
        document.documentElement.style.setProperty('--vscode-focusBorder', '#0078d4');
        document.documentElement.style.setProperty('--vscode-contrastActiveBorder', '#f38518');
        try {
            const toolbar = document.querySelector('[data-testid="installed-toolbar"]') as HTMLElement;
            toolbar.insertAdjacentHTML('beforeend', '<span id="why" class="nuiget-visually-hidden">Select packages first.</span>');
            const uninstall = document.querySelector('[data-testid="uninstall-selected-button"]') as HTMLButtonElement;
            uninstall.disabled = true;
            // Two ids, one of them missing: the list splits on white space.
            uninstall.setAttribute('aria-describedby', 'missing why');
            const select = document.querySelector('[data-testid="select-all-button"]') as HTMLButtonElement;
            select.setAttribute('aria-disabled', 'true');
            select.removeAttribute('disabled');
            (document.querySelector('[data-testid="package-details-panel"] [data-testid="uninstall-button"]') as HTMLButtonElement).focus();
            const facts = collect().endOfP0;
            expect(facts.focus).toMatchObject({ kind: 'button', label: '[uninstall-button]', outline: { width: 1, style: 'solid', colour: 'rgb(0, 120, 212)', offset: 2 }, band: undefined });
            expect(facts.focusColours).toEqual({ focusBorder: '#0078d4', listFocusOutline: '', contrastActiveBorder: '#f38518' });
            expect(facts.disabled).toEqual([{ label: '[select-all-button]', reason: '' }, { label: '[uninstall-selected-button]', reason: 'Select packages first.' }]);
            expect(facts.rows[0]).toMatchObject({ outline: { width: 1, style: 'dotted', colour: 'rgb(243, 133, 24)', offset: -1 }, focused: false });
            // A focused option is the focus, inside its row band.
            const option = document.querySelector('[role="option"]') as HTMLElement;
            option.tabIndex = 0;
            option.focus();
            const onRow = collect().endOfP0;
            expect(onRow.focus).toMatchObject({ kind: 'option', band: { left: 0, top: 136, right: 600, bottom: 214 } });
            expect(onRow.rows[0].focused).toBe(true);
            // An icon button is a kind of its own (DS-FOCUS-1 names no offset for it).
            (document.querySelector('.nuiget-row-actions .nuiget-icon-button') as HTMLButtonElement).focus();
            expect(collect().endOfP0.focus?.kind).toBe('icon-button');
            // Nothing focused: no subject.
            (document.activeElement as HTMLElement).blur();
            option.blur();
            expect(collect().endOfP0.focus).toBeUndefined();
        } finally {
            document.getElementById('p014')?.remove();
            document.documentElement.style.removeProperty('--vscode-focusBorder');
            document.documentElement.style.removeProperty('--vscode-contrastActiveBorder');
        }
    });

    it('reads every element with a test id relative to the root, a repeated id numbered, as the artboard export does (helper 8, UX-P0.13)', () => {
        const testIds = collect().testIds;
        expect(testIds['tab-bar']).toMatchObject({ rect: { x: 0, y: 40, w: 600, h: 30 }, inset: 0 });
        // Padding as the four computed sides, top first (jsdom writes the stylesheet's own values).
        expect(testIds['select-all-button']).toMatchObject({ rect: { x: 16, y: 74, w: 84, h: 26 }, inset: 29 });
        expect(testIds['select-all-button'].padding.split(' ')).toHaveLength(4);
        expect(testIds['select-all-button'].padding.split(' ')[1]).toBe('12px');
        // The root itself is not listed; its rect is the origin.
        expect(testIds['nuiget-app']).toBeUndefined();
        document.querySelector('[data-testid="installed-toolbar"]')?.insertAdjacentHTML('beforeend', '<button class="nuiget-button" data-testid="select-all-button" data-rect="120,74,200,100"></button>');
        expect(collect().testIds['select-all-button#2']).toMatchObject({ rect: { x: 120, y: 74, w: 80, h: 26 }, inset: 133 });
    });

    it('answers a missing root with an empty layout', () => {
        expect(collect('nuiget-sidebar')).toMatchObject({ root: false, sections: [], centring: [] });
    });

    it('measures the first visible match of a workbench control, and null for none', () => {
        const widgets = new Function(MEASURE_WIDGETS).apply(null, [[['tabs', ['.nope', '[data-testid="tab-bar"]']], ['absent', ['.nope']]]]) as Record<string, WidgetMeasure | null>;
        expect(widgets.tabs).toMatchObject({ selector: '[data-testid="tab-bar"]', height: 30, width: 600 });
        expect(widgets.absent).toBeNull();
    });

    it('measures the box and paint of a workbench element by visible match, and null for none (the exemplar, UX-P0.14)', () => {
        const looks = new Function(MEASURE_LOOK).apply(null, [[['button', ['.nope', '.nuiget-button']], ['absent', ['.nope']]], 1]) as Record<string, LookMeasure | null>;
        expect(looks.button).toMatchObject({ selector: '.nuiget-button', classes: 'nuiget-button', rect: { x: 400, y: 74, w: 194, h: 26 }, background: 'rgb(14, 99, 156)', overflowsX: false });
        expect(looks.button?.border).toBe('1px 1px 1px 1px solid rgba(0, 0, 0, 0)');
        expect(looks.button).toMatchObject({ fontSize: '13px', padding: '0px 12px 0px 12px' });
        expect(looks.absent).toBeNull();
    });
});
