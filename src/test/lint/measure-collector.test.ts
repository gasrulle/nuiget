// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COLLECT_LAYOUT, type Layout, MEASURE_WIDGETS, RAMP, TOLERANCES, type WidgetMeasure } from '../ui/v2/measure';

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
    <div id="direct-content" data-testid="installed-list" role="listbox" data-rect="0,136,600,300">
      <div class="nuiget-row nuiget-row--comfortable" data-rect="0,136,600,214"><div role="option" aria-selected="true" data-rect="0,136,600,213">
        <span class="nuiget-row-check" data-rect="16,167,32,183"></span><span class="nuiget-row-icon" data-rect="40,159,72,191"></span>
        <span class="nuiget-row-name" data-rect="80,150,200,166" data-text="80,150,200,166">Serilog</span>
        <span class="nuiget-badge" data-rect="210,150,240,166" data-text="212,151,238,165">CPM<span class="nuiget-visually-hidden">Central</span></span>
        <span class="nuiget-row-version" data-rect="80,170,120,184" data-text="80,170,120,184">3.1.1</span>
        <span class="nuiget-row-authors" data-rect="80,190,200,204" data-text="80,190,200,204">Serilog Contributors</span>
      </div><div class="nuiget-row-actions" data-rect="560,160,594,190"><button class="nuiget-icon-button" data-rect="566,163,590,187"></button></div></div>
      <div class="nuiget-row nuiget-row--comfortable" data-rect="0,214,600,292"><div role="option" data-rect="0,214,600,291">
        <span class="nuiget-row-check" data-rect="16,245,32,261"></span><span class="nuiget-row-icon" data-rect="40,237,72,269"></span>
        <span class="nuiget-row-name" data-rect="80,228,200,244" data-text="80,228,200,244">Moq</span>
      </div></div>
    </div>
    <div class="nuiget-section-header" data-testid="section-box-transitive" data-variant="group" data-rect="0,300,600,322">
      <h2 data-rect="16,300,540,322"><button class="nuiget-section-toggle" aria-controls="transitive-content" data-rect="16,300,540,322">
        <span class="nuiget-section-title" data-rect="36,303,180,319" data-text="36,303,180,319">Transitive packages</span>
      </button></h2>
      <div class="nuiget-section-actions" data-rect="540,303,598,319"><span class="nuiget-badge" data-rect="560,304,598,318" data-text="562,305,596,317">provisional</span></div>
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
        expect(layout.primaryEdges).toEqual([{ list: 'installed-list', button: 594, listRight: 600 }]);
    });

    it('answers a missing root with an empty layout', () => {
        expect(collect('nuiget-sidebar')).toMatchObject({ root: false, sections: [], centring: [] });
    });

    it('measures the first visible match of a workbench control, and null for none', () => {
        const widgets = new Function(MEASURE_WIDGETS).apply(null, [[['tabs', ['.nope', '[data-testid="tab-bar"]']], ['absent', ['.nope']]]]) as Record<string, WidgetMeasure | null>;
        expect(widgets.tabs).toMatchObject({ selector: '[data-testid="tab-bar"]', height: 30, width: 600 });
        expect(widgets.absent).toBeNull();
    });
});
