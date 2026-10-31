// @vitest-environment jsdom
/**
 * Benchmarks for the virtualized `Listbox` of the 2.0 webviews: mounting a list of 1 000 rows and moving to its last row
 * with End, with the real virtualizer under `installFakeLayout()`. Replaces the 1.x `react-rendering` benchmark
 * (P8.2a, D8; the P8.2 ruling names this subject).
 */
import { act, fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterAll, describe, test } from 'vitest';
import { runBenchmark } from '../../../test/benchmarks/benchmark';
import { Listbox } from './Listbox';
import { Row, type RowPlacement } from './Row';
import { installFakeLayout } from './testSupport';

interface Item {
    id: string;
    version: string;
}

const ROWS = 1_000;
const items: Item[] = Array.from({ length: ROWS }, (_, index) => ({ id: `Package${index}`, version: `1.${index % 10}.0` }));
const restoreLayout = installFakeLayout({ viewport: 480, row: 24 });
afterAll(() => restoreLayout());

function list() {
    return createElement(Listbox<Item>, {
        items,
        label: 'Installed packages',
        hint: 'Enter uninstalls.',
        testId: 'bench-list',
        density: 'compact',
        renderRow: (item: Item, placement: RowPlacement) => createElement(Row, { ...placement, itemId: item.id, name: item.id, version: item.version }),
    });
}

describe('webview primitives — Listbox', () => {
    test(`mount ${ROWS} rows`, async (context) => {
        await runBenchmark(context, `mount ${ROWS} rows`, () => {
            render(list()).unmount();
        });
    });

    test(`mount ${ROWS} rows and press End`, async (context) => {
        await runBenchmark(context, `mount ${ROWS} rows and press End`, () => {
            const view = render(list());
            const listbox = view.getByRole('listbox');
            act(() => {
                listbox.focus();
            });
            fireEvent.keyDown(listbox, { key: 'End' });
            view.unmount();
        });
    });
});
