import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectFocusAfterClose, expectFocusOnListTabStop, FOCUS_AFTER_CLOSE_PENDING } from './testSupport';

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

    it('holds no pending case: every close site is hard since UX-P4.4', () => {
        expect(FOCUS_AFTER_CLOSE_PENDING).toEqual({});
    });

    // UX-P4.4 (design-advisor ruling of 2026-11-17, DO 7): an element that cannot hold the focus does not count.
    it('fails a hard case when the focused element is disabled, inert or hidden', () => {
        document.body.innerHTML = '<div inert><button>Inert</button></div><div aria-hidden="true"><button>Hidden</button></div><button>Opener</button>';
        const [inert, hidden, opener] = [...document.querySelectorAll<HTMLButtonElement>('button')];
        for (const element of [inert, hidden]) {
            vi.spyOn(document, 'activeElement', 'get').mockReturnValue(element);
            expect(() => expectFocusAfterClose('a-hard-case', {})).toThrow('which is disabled, disconnected, inert or hidden');
            vi.restoreAllMocks();
        }
        opener.disabled = true;
        vi.spyOn(document, 'activeElement', 'get').mockReturnValue(opener);
        expect(() => expectFocusAfterClose('a-hard-case', {})).toThrow('[focus] a-hard-case: focus is on button, which is disabled, disconnected, inert or hidden');
    });

    it('fails a hard case when the focused element is no longer in the document', () => {
        const gone = document.createElement('button');
        vi.spyOn(document, 'activeElement', 'get').mockReturnValue(gone);
        expect(() => expectFocusAfterClose('a-hard-case', {})).toThrow('which is disabled, disconnected, inert or hidden');
    });
});

describe('expectFocusOnListTabStop (UX-P4.4)', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('passes on the list\'s active row and fails elsewhere, naming what has the focus', () => {
        document.body.innerHTML = '<div data-testid="installed-list" role="listbox"><div role="option" tabindex="-1">Moq</div><div role="option" tabindex="0">Serilog</div></div><button data-testid="other">Other</button>';
        document.querySelector<HTMLElement>('[tabindex="0"]')!.focus();
        expect(() => expectFocusOnListTabStop('installed-list')).not.toThrow();
        document.querySelector<HTMLElement>('[data-testid="other"]')!.focus();
        expect(() => expectFocusOnListTabStop('installed-list')).toThrow('[focus] expected the active row of installed-list, found button[data-testid="other"]');
        expect(() => expectFocusOnListTabStop('updates-list')).toThrow('[focus] the list updates-list has no active row');
    });
});
