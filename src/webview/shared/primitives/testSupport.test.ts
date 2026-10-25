import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectFocusAfterClose, FOCUS_AFTER_CLOSE_PENDING } from './testSupport';

/** UX-P0.24 (`a11y-focus-after-close`, A6): the guard every feature test calls after its dialog closes. */
describe('expectFocusAfterClose (UX-P0.24)', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('passes when focus is on an element of the page', () => {
        document.body.innerHTML = '<button data-testid="opener">Open</button>';
        document.querySelector<HTMLButtonElement>('button')!.focus();
        expect(() => expectFocusAfterClose('a-hard-case', {})).not.toThrow();
    });

    it('fails a hard case when focus fell to <body>', () => {
        document.body.innerHTML = '<button disabled>Uninstall selected (0)</button>';
        (document.activeElement as HTMLElement | null)?.blur();
        expect(() => expectFocusAfterClose('a-hard-case', {})).toThrow('[focus] a-hard-case: focus fell to <body> after the dialog closed (a11y-focus-after-close)');
    });

    it('prints a pending case with its item and asserts nothing', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => expectFocusAfterClose('a-pending-case', { 'a-pending-case': { pending: 'P4.4' } })).not.toThrow();
        expect(warn).toHaveBeenCalledWith('[focus] a-pending-case: focus on <body> after the dialog closed (pending P4.4)');
        document.body.innerHTML = '<div data-testid="installed-list" tabindex="0"></div>';
        document.querySelector<HTMLElement>('[data-testid="installed-list"]')!.focus();
        expectFocusAfterClose('a-pending-case', { 'a-pending-case': { pending: 'P4.4' } });
        expect(warn).toHaveBeenLastCalledWith('[focus] a-pending-case: focus on div[data-testid="installed-list"] after the dialog closed (pending P4.4)');
    });

    it('holds exactly the eleven close sites of the design-advisor ruling pending on P4.4', () => {
        expect(Object.keys(FOCUS_AFTER_CLOSE_PENDING).sort()).toEqual([
            'details-cpm-install-confirm', 'details-cpm-update-confirm', 'installed-all-projects-uninstall-confirm', 'installed-bulk-uninstall-confirm',
            'installed-bulk-uninstall-partial-confirm', 'sidebar-all-projects-update-all-confirm', 'sidebar-update-all-confirm', 'sources-host-opened-escape',
            'updates-all-projects-update-confirm', 'updates-busy-update-all-confirm', 'updates-update-all-confirm',
        ]);
        expect(Object.values(FOCUS_AFTER_CLOSE_PENDING).every(status => status.pending === 'P4.4')).toBe(true);
    });
});
