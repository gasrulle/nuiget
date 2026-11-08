/**
 * A list header's count: the total, `k of N` while a filter is on. Both surfaces' headers take it (DS-COPY-5; the main
 * panel's group rows since UX-P2.6, the sidebar's pane headers since UX-P3.7b).
 */
export function directCount(total: number, shown: number, filtering: boolean): number | string {
    return filtering ? `${shown} of ${total}` : total;
}
