// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { authoritative, BROWSE_ROW, dependencies, details, icons, INSTALLED_ROW, installedRowOf, type PerfChain, perfComplete, perfLines, perfRecorder, type PerfResult, PROVISIONAL, READ_PERF, REVALIDATING, SETTLED, STOP_PERF } from '../ui/v2/perf';

/**
 * UX-P0.26: the in-page recorder of `src/test/ui/v2/perf.ts` and its predicates on a jsdom page. The timings themselves
 * are the UI job's `[perf]` lines; this test holds the recorder's logic (first appearance, a mark present when it starts
 * or at the start event, the `after` gate, the start listener) and the lines' format on every push.
 */
const run = <T>(source: string): T => new Function(source)() as T;
const read = (): PerfResult | null => run<PerfResult | null>(READ_PERF);
/** MutationObserver callbacks are microtasks; one macrotask lets them all run. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const row = (id: string, extra = ''): string =>
    `<div class="nuiget-row nuiget-row--comfortable" data-testid="package-row-${id}"><div class="nuiget-row-option" role="option"><span class="nuiget-row-icon"><img src="${extra || 'data:default'}"></span><span class="nuiget-row-name">${id}</span></div></div>`;

const PANEL_OPEN: PerfChain = {
    label: 'panel open',
    context: 'Gateway',
    start: { kind: 'load' },
    marks: [{ name: 'first row', predicate: INSTALLED_ROW }, { name: 'icons', predicate: icons(INSTALLED_ROW) }],
    flags: [{ name: 'provisional', predicate: PROVISIONAL, seen: 'provisional list shown', unseen: 'no provisional list' }],
};

afterEach(() => {
    run(STOP_PERF);
    document.body.innerHTML = '';
});

describe('the perf recorder (UX-P0.26)', () => {
    it('arms only once the root exists when asked to, and stamps a row that appears after it', async () => {
        expect(run<boolean>(perfRecorder(PANEL_OPEN, '#root'))).toBe(false);
        expect(read()).toBeNull();
        document.body.innerHTML = '<div id="root" data-package-icon="data:default"><div data-testid="installed-list"></div></div>';
        expect(run<boolean>(perfRecorder(PANEL_OPEN, '#root'))).toBe(true);
        expect(read()?.marks).toEqual({});
        document.querySelector('[data-testid="installed-list"]')!.innerHTML = row('serilog');
        await settle();
        const result = read()!;
        expect(result.start).toBe(0);
        expect(result.marks['first row']?.when).toBe('observed');
        expect(result.marks['first row']!.ms).toBeGreaterThanOrEqual(result.installedAt);
        expect(result.marks.icons).toBeUndefined();
        expect(perfComplete(PANEL_OPEN, result)).toBe(false);
    });

    it('records a mark present when it starts as an upper bound, and a flag that held', async () => {
        document.body.innerHTML = `<div id="root" data-package-icon="data:default"><div data-testid="section-box-direct"><span class="nuiget-badge">provisional</span></div><div data-testid="installed-list"><div class="nuiget-row nuiget-row--comfortable" data-row-kind="group"></div>${row('serilog')}</div></div>`;
        run(perfRecorder(PANEL_OPEN, '#root'));
        expect(read()!.marks['first row']?.when).toBe('install');
        expect(read()!.flags.provisional).toBeDefined();
        const option = document.querySelector('[data-testid="package-row-serilog"] .nuiget-row-icon')!;
        option.insertAdjacentHTML('afterend', '<span class="nuiget-row-authors">Serilog Contributors</span>');
        document.querySelector('[data-testid="package-row-serilog"] img')!.setAttribute('src', 'data:own');
        await settle();
        const result = read()!;
        expect(result.marks.icons?.when).toBe('observed');
        expect(perfComplete(PANEL_OPEN, result)).toBe(true);
        expect(perfLines(PANEL_OPEN, result, 60_000)).toEqual([
            `[perf] panel open: Gateway; recorder started ${Math.round(result.installedAt)} ms after load; provisional list shown`,
            `[perf] panel open → first row: ≤ ${Math.round(result.marks['first row']!.ms)} ms (present when the recorder started)`,
            `[perf] panel open → icons: ${Math.round(result.marks.icons!.ms)} ms`,
        ]);
    });

    it('times an event chain from its start event, ignores other events, and calls a mark already true at the start not measured', async () => {
        document.body.innerHTML = '<input data-testid="search-input"><div data-testid="other"></div><div id="results"></div>';
        const chain: PerfChain = {
            label: 'search',
            context: 'new text',
            start: { kind: 'event', type: 'keydown', selector: '[data-testid="search-input"]', key: 'Enter' },
            marks: [{ name: 'first result', predicate: BROWSE_ROW }, { name: 'input', predicate: 'document.querySelector("input") !== null' }],
        };
        run(perfRecorder(chain));
        const input = document.querySelector('input')!;
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
        document.querySelector('[data-testid="other"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(read()!.start).toBeNull();
        expect(perfLines(chain, read(), 60_000)).toEqual([
            '[perf] search: new text; the start event never came',
            '[perf] search → first result: not measured (no start event)',
            '[perf] search → input: not measured (no start event)',
        ]);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        const started = read()!.start;
        expect(started).not.toBeNull();
        document.getElementById('results')!.innerHTML = '<div data-testid="browse-list"><div role="option">Humanizer</div></div>';
        await settle();
        const result = read()!;
        expect(result.start).toBe(started);
        expect(result.marks['first result']?.when).toBe('observed');
        expect(result.marks.input?.when).toBe('start');
        expect(perfLines(chain, result, 60_000).slice(1)).toEqual([
            `[perf] search → first result: ${Math.round(result.marks['first result']!.ms)} ms`,
            '[perf] search → input: not measured (present before the start)',
        ]);
    });

    it('stamps a mark with `after` only once its flag held', async () => {
        document.body.innerHTML = `<div id="root"><div data-testid="section-box-direct"></div><div data-testid="installed-list">${row('serilog')}</div><button data-testid="refresh-button"></button></div>`;
        document.querySelector('.nuiget-row-icon')!.insertAdjacentHTML('afterend', '<span class="nuiget-row-authors">a</span>');
        const chain: PerfChain = {
            label: 'refresh',
            context: 'Gateway',
            start: { kind: 'event', type: 'pointerdown', selector: '[data-testid="refresh-button"]' },
            marks: [{ name: 'list settled', predicate: SETTLED, after: 'revalidating' }],
            flags: [{ name: 'revalidating', predicate: REVALIDATING, seen: 'revalidated', unseen: 'no revalidation seen' }],
        };
        run(perfRecorder(chain));
        document.querySelector('button')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await settle();
        expect(read()!.marks['list settled']).toBeUndefined();
        const list = document.querySelector('[data-testid="installed-list"]')!;
        list.setAttribute('aria-busy', 'true');
        await settle();
        expect(read()!.flags.revalidating).toBeDefined();
        expect(read()!.marks['list settled']).toBeUndefined();
        list.removeAttribute('aria-busy');
        await settle();
        expect(read()!.marks['list settled']?.when).toBe('observed');
        expect(perfLines(chain, read(), 60_000)[0]).toBe('[perf] refresh: Gateway; revalidated');
    });

    it('stops observing when disarmed, and a replaced recorder starts afresh', async () => {
        const held = (): PerfResult => (window as unknown as { __nuigetPerf: { state: PerfResult } }).__nuigetPerf.state;
        const list = (): Element => document.querySelector('[data-testid="installed-list"]')!;
        document.body.innerHTML = '<div id="root"><div data-testid="installed-list"></div></div>';
        run(perfRecorder(PANEL_OPEN));
        const replaced = held();
        run(perfRecorder(PANEL_OPEN));
        const current = held();
        list().innerHTML = row('serilog');
        await settle();
        expect(current.marks['first row']?.when).toBe('observed');
        // The replaced recorder's observer was disconnected: its state gained nothing.
        expect(replaced.marks).toEqual({});
        run(STOP_PERF);
        expect(read()).toBeNull();
        const before = JSON.stringify(current);
        // What would stamp `icons` and the provisional flag if anything still observed.
        document.getElementById('root')!.insertAdjacentHTML('afterbegin', '<div data-testid="section-box-direct"><span class="nuiget-badge">provisional</span></div>');
        list().innerHTML = row('polly', 'data:own');
        list().querySelector('.nuiget-row-icon')!.insertAdjacentHTML('afterend', '<span class="nuiget-row-authors">App vNext</span>');
        expect(run<boolean>(`return (${icons(INSTALLED_ROW)}) && (${PROVISIONAL});`)).toBe(true);
        await settle();
        expect(JSON.stringify(current)).toBe(before);
        expect(perfLines(PANEL_OPEN, null, 60_000)).toEqual(['[perf] panel open: not measured (no recorder in the webview)']);
    });

    it('prints an unreached mark with the wait, and no line ends in a status suffix', () => {
        const result: PerfResult = { installedAt: 10, start: 0, marks: { 'first row': { ms: 12.4, when: 'observed' } }, flags: {} };
        const lines = perfLines(PANEL_OPEN, result, 60_000);
        expect(lines).toEqual([
            '[perf] panel open: Gateway; recorder started 10 ms after load; no provisional list',
            '[perf] panel open → first row: 12 ms',
            '[perf] panel open → icons: not measured (not reached in 60 s)',
        ]);
        for (const line of lines) {
            expect(line).not.toMatch(/\((pending [^)]+|hard)\)$/);
        }
    });
});

describe('the perf predicates (UX-P0.26)', () => {
    const holds = (predicate: string): boolean => run<boolean>(`return (${predicate});`);

    it('tells a project\'s own rows from another project\'s', () => {
        document.body.innerHTML = `<div data-testid="installed-list">${row('serilog')}${row('polly')}</div>`;
        expect(holds(installedRowOf(['spectre.console', 'nodatime']))).toBe(false);
        expect(holds(installedRowOf(['polly']))).toBe(true);
    });

    it('reads the evaluated list from the absence of the provisional badge', () => {
        document.body.innerHTML = `<div data-testid="section-box-direct"><span class="nuiget-badge">provisional</span></div><div data-testid="installed-list">${row('serilog')}</div>`;
        expect(holds(authoritative(INSTALLED_ROW))).toBe(false);
        document.querySelector('.nuiget-badge')!.remove();
        expect(holds(authoritative(INSTALLED_ROW))).toBe(true);
    });

    it('takes the icons as arrived once every row has authors and one shows its own icon', () => {
        document.body.innerHTML = `<div id="root" data-package-icon="data:default"><div data-testid="installed-list">${row('serilog')}${row('polly')}</div></div>`;
        const both = [...document.querySelectorAll('.nuiget-row-icon')];
        both[0].insertAdjacentHTML('afterend', '<span class="nuiget-row-authors">a</span>');
        expect(holds(icons(INSTALLED_ROW))).toBe(false);
        both[1].insertAdjacentHTML('afterend', '<span class="nuiget-row-authors">b</span>');
        expect(holds(icons(INSTALLED_ROW))).toBe(false);
        document.querySelector('img')!.setAttribute('src', 'data:own');
        expect(holds(icons(INSTALLED_ROW))).toBe(true);
    });

    it('waits for the details of the clicked package and their dependency groups', () => {
        document.body.innerHTML = '<div data-testid="package-details-panel">NodaTime</div>';
        expect(holds(details('nodatime'))).toBe(false);
        document.body.insertAdjacentHTML('beforeend', '<select data-testid="version-selector"></select>');
        expect(holds(details('nodatime'))).toBe(true);
        expect(holds(details('serilog'))).toBe(false);
        expect(holds(dependencies('nodatime'))).toBe(false);
        document.querySelector('[data-testid="package-details-panel"]')!.insertAdjacentHTML('beforeend', '<h3>Dependencies</h3>');
        expect(holds(dependencies('nodatime'))).toBe(true);
    });

    it('sees no Browse row in the skeleton', () => {
        document.body.innerHTML = '<div class="nuiget-skeleton" aria-hidden="true"><div class="nuiget-skeleton-row"></div></div>';
        expect(holds(BROWSE_ROW)).toBe(false);
        document.body.innerHTML = '<div data-testid="browse-list" role="listbox"><div role="option">Humanizer</div></div>';
        expect(holds(BROWSE_ROW)).toBe(true);
    });
});
