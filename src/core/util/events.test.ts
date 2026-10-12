import { afterEach, describe, expect, it, vi } from 'vitest';
import { Emitter, toDisposable } from './events';

describe('toDisposable', () => {
    it('runs the cleanup exactly once even when disposed repeatedly', () => {
        const fn = vi.fn();
        const disposable = toDisposable(fn);
        disposable.dispose();
        disposable.dispose();
        expect(fn).toHaveBeenCalledTimes(1);
    });
});

describe('Emitter', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('delivers fired values to every listener in subscription order', () => {
        const emitter = new Emitter<number>();
        const calls: string[] = [];
        emitter.event(value => calls.push(`a${value}`));
        emitter.event(value => calls.push(`b${value}`));

        emitter.fire(1);
        emitter.fire(2);

        expect(calls).toEqual(['a1', 'b1', 'a2', 'b2']);
        expect(emitter.listenerCount).toBe(2);
    });

    it('stops delivering to a listener once its disposable is disposed', () => {
        const emitter = new Emitter<string>();
        const first = vi.fn();
        const second = vi.fn();
        const subscription = emitter.event(first);
        emitter.event(second);

        subscription.dispose();
        emitter.fire('x');

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledWith('x');
        expect(emitter.listenerCount).toBe(1);
    });

    it('isolates a throwing listener and still notifies the others', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const emitter = new Emitter<number>();
        const boom = new Error('boom');
        const after = vi.fn();
        emitter.event(() => {
            throw boom;
        });
        emitter.event(after);

        expect(() => emitter.fire(7)).not.toThrow();
        expect(after).toHaveBeenCalledWith(7);
        expect(consoleError).toHaveBeenCalledTimes(1);
        expect(consoleError.mock.calls[0][1]).toBe(boom);
    });

    it('does not let a listener added during dispatch receive the in-flight value', () => {
        const emitter = new Emitter<number>();
        const late = vi.fn();
        emitter.event(() => {
            emitter.event(late);
        });

        emitter.fire(1);
        expect(late).not.toHaveBeenCalled();

        emitter.fire(2);
        expect(late).toHaveBeenCalledTimes(1);
        expect(late).toHaveBeenCalledWith(2);
    });

    it('keeps dispatching to remaining listeners when one unsubscribes mid-dispatch', () => {
        const emitter = new Emitter<number>();
        const second = vi.fn();
        const first = emitter.event(() => first.dispose());
        emitter.event(second);

        emitter.fire(1);

        expect(second).toHaveBeenCalledWith(1);
        expect(emitter.listenerCount).toBe(1);
    });

    it('ignores fire() and new subscriptions after dispose', () => {
        const emitter = new Emitter<number>();
        const before = vi.fn();
        const beforeSubscription = emitter.event(before);
        emitter.dispose();

        const after = vi.fn();
        const subscription = emitter.event(after);
        emitter.fire(1);
        subscription.dispose();
        // Disposing a subscription whose listener was already dropped by dispose() is a no-op.
        beforeSubscription.dispose();

        expect(before).not.toHaveBeenCalled();
        expect(after).not.toHaveBeenCalled();
        expect(emitter.listenerCount).toBe(0);
    });
});
