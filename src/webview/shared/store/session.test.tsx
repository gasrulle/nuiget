import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { SessionSnapshot } from '../../../protocol';
import { createFakeHost, type FakeHost } from '../bus/testSupport';
import { MessageBusProvider } from '../bus/useMessageBus';
import { INITIAL_SESSION, presentedSession, SessionProvider, sessionReducer, useSession, useSessionActions, type SessionState } from './session';

const A = '/w/A/A.csproj';
const B = '/w/B/B.csproj';
const snapshot = (rev: number, changes: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
    rev, selectedProject: A, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host', ...changes,
});

let renders = 0;

/** The prerelease toggle and the project of a surface. */
function Surface() {
    const { session, committed, isPending } = useSession();
    const { set } = useSessionActions();
    if (session === undefined) {
        return <p>Loading</p>;
    }
    return (
        <div>
            <label>
                <input type="checkbox" checked={session.includePrerelease} onChange={event => set({ includePrerelease: event.target.checked })} />
                Include prerelease
            </label>
            <output data-testid="project">{session.selectedProject}</output>
            <output data-testid="committed">{`${committed?.rev} ${committed?.selectedProject} ${committed?.includePrerelease}`}</output>
            <output data-testid="pending">{String(isPending)}</output>
            <button type="button" onClick={() => set({ selectedProject: A })}>Select A</button>
            <button type="button" onClick={() => set({ selectedProject: B })}>Select B</button>
        </div>
    );
}

/** Uses the actions only: it has no reason to render when the session changes. */
function ActionsOnly() {
    useSessionActions();
    renders++;
    return null;
}

function mount(): FakeHost {
    const host = createFakeHost();
    renders = 0;
    render(<MessageBusProvider bus={host.bus}><SessionProvider><Surface /><ActionsOnly /></SessionProvider></MessageBusProvider>);
    return host;
}

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});
const text = (testId: string): string => screen.getByTestId(testId).textContent ?? '';
const prerelease = (): HTMLInputElement => screen.getByRole('checkbox', { name: 'Include prerelease' });

describe('session slice', () => {
    it('R1: asks session/get on start and shows nothing before the first snapshot', async () => {
        const host = mount();
        expect(host.requests('session/get')).toHaveLength(1);
        expect(screen.getByText('Loading')).toBeInTheDocument();
        // The first snapshot is applied whatever its revision.
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(0)));
        expect(text('committed')).toBe(`0 ${A} false`);
    });

    it('R1: a snapshot is applied only when its rev is above the last applied one', async () => {
        const host = mount();
        await hostSays(() => host.event('session/changed', snapshot(5, { selectedProject: B })));
        // The answer to the first request arrives after a newer broadcast: it is behind.
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(4, { selectedProject: A })));
        expect(text('committed')).toBe(`5 ${B} false`);
        // The same revision again changes nothing, even if it says something else.
        await hostSays(() => host.event('session/changed', snapshot(5, { selectedProject: A })));
        expect(text('project')).toBe(B);
        await hostSays(() => host.event('session/changed', snapshot(6, { selectedProject: A })));
        expect(text('committed')).toBe(`6 ${A} false`);
    });

    it('asks session/get again when the document becomes visible, and a stale answer changes nothing', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(3, { selectedProject: B })));
        const setVisibility = (state: DocumentVisibilityState): void => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
            document.dispatchEvent(new Event('visibilitychange'));
        };
        try {
            await act(async () => setVisibility('hidden'));
            expect(host.requests('session/get')).toHaveLength(1);
            await act(async () => setVisibility('visible'));
            expect(host.requests('session/get')).toHaveLength(2);
            await hostSays(() => host.respond(host.requests('session/get')[1], snapshot(2, { selectedProject: A })));
            expect(text('committed')).toBe(`3 ${B} false`);
            await act(async () => setVisibility('visible'));
            await hostSays(() => host.respond(host.requests('session/get')[2], snapshot(4, { selectedProject: A })));
            expect(text('committed')).toBe(`4 ${A} false`);
        } finally {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        }
    });

    it('pending toggle renders before commit', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        expect(prerelease()).not.toBeChecked();

        await userEvent.click(prerelease());
        // At once, with no answer from the host: the toggle shows what was asked for.
        expect(prerelease()).toBeChecked();
        expect(text('pending')).toBe('true');
        // Presentation only: the committed state is the host's, and the host was sent the intent and nothing else.
        expect(text('committed')).toBe(`1 ${A} false`);
        expect(host.requests('session/set').map(request => request.payload)).toEqual([{ includePrerelease: true }]);

        // The commit: the broadcast and the response carry the same revision, in either order.
        const committed = snapshot(2, { includePrerelease: true, origin: 'sidebar' });
        await hostSays(() => host.event('session/changed', committed));
        expect(prerelease()).toBeChecked();
        expect(text('pending')).toBe('true');
        await hostSays(() => host.respond(host.requests('session/set')[0], committed));
        expect(prerelease()).toBeChecked();
        expect(text('pending')).toBe('false');
        expect(text('committed')).toBe(`2 ${A} true`);
    });

    it('the host may answer an intent with something else: the committed value replaces the pending one', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        await userEvent.click(screen.getByRole('button', { name: 'Select B' }));
        expect(text('project')).toBe(B);
        // B is gone; the host normalized the selection back to A.
        await hostSays(() => host.respond(host.requests('session/set')[0], snapshot(2, { selectedProject: A })));
        expect(text('project')).toBe(A);
        expect(text('pending')).toBe('false');
    });

    it('an error on session/set takes the pending toggle back', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        await userEvent.click(prerelease());
        expect(prerelease()).toBeChecked();
        await hostSays(() => host.fail(host.requests('session/set')[0], 'failed'));
        expect(prerelease()).not.toBeChecked();
        expect(text('pending')).toBe('false');
        expect(text('committed')).toBe(`1 ${A} false`);
    });

    it('two intents on their way: the answer to the first does not show through the second', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        await userEvent.click(screen.getByRole('button', { name: 'Select B' }));
        await userEvent.click(screen.getByRole('button', { name: 'Select A' }));
        expect(text('project')).toBe(A);
        const [toB, toA] = host.requests('session/set');

        // B is committed first, as asked; the surface keeps showing A, which it asked for last.
        await hostSays(() => host.event('session/changed', snapshot(2, { selectedProject: B })));
        expect(text('project')).toBe(A);
        await hostSays(() => host.respond(toB, snapshot(2, { selectedProject: B })));
        expect(text('project')).toBe(A);
        expect(text('committed')).toBe(`2 ${B} false`);
        expect(text('pending')).toBe('true');
        await hostSays(() => host.respond(toA, snapshot(3, { selectedProject: A })));
        expect(text('project')).toBe(A);
        expect(text('committed')).toBe(`3 ${A} false`);
        expect(text('pending')).toBe('false');
    });

    it('a change from the other surface shows at once and leaves a pending change of this one in place', async () => {
        const host = mount();
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        await userEvent.click(prerelease());
        await hostSays(() => host.event('session/changed', snapshot(2, { selectedProject: B, origin: 'main' })));
        expect(text('project')).toBe(B);
        expect(prerelease()).toBeChecked();
        expect(text('committed')).toBe(`2 ${B} false`);
    });

    it('a component that only sends intents does not render when the session changes', async () => {
        const host = mount();
        const before = renders;
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        await userEvent.click(prerelease());
        await hostSays(() => host.event('session/changed', snapshot(2, { includePrerelease: true })));
        expect(renders).toBe(before);
    });

    it('the hooks fail with a clear message without a provider', () => {
        expect(() => render(<Surface />)).toThrow('useSession needs a SessionProvider above it');
        expect(() => render(<ActionsOnly />)).toThrow('useSessionActions needs a SessionProvider above it');
    });
});

describe('session reducer', () => {
    it('lays pending intents over the committed snapshot, oldest first', () => {
        let state: SessionState = INITIAL_SESSION;
        expect(presentedSession(state)).toBeUndefined();
        // An intent before the first snapshot has nothing to lie on.
        state = sessionReducer(state, { type: 'intent', id: 1, intent: { includePrerelease: true } });
        expect(presentedSession(state)).toBeUndefined();
        state = sessionReducer(state, { type: 'snapshot', snapshot: snapshot(1) });
        state = sessionReducer(state, { type: 'intent', id: 2, intent: { selectedProject: B, includePrerelease: false } });
        expect(presentedSession(state)).toEqual(snapshot(1, { selectedProject: B, includePrerelease: false }));
        state = sessionReducer(state, { type: 'settled', id: 2 });
        expect(presentedSession(state)).toEqual(snapshot(1, { includePrerelease: true }));
        state = sessionReducer(state, { type: 'settled', id: 1 });
        expect(presentedSession(state)).toEqual(snapshot(1));
        // Settling what is not pending, and a snapshot that is behind, return the very same state.
        expect(sessionReducer(state, { type: 'settled', id: 9 }).pending).toEqual([]);
        expect(sessionReducer(state, { type: 'snapshot', snapshot: snapshot(1, { selectedProject: B }) })).toBe(state);
        expect(sessionReducer(state, { type: 'snapshot', snapshot: snapshot(0) })).toBe(state);
    });
});
