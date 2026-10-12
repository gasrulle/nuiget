import type { Disposable, Event, Listener } from '../contracts';

/** Wrap a cleanup function as a `Disposable` that runs it at most once. */
export function toDisposable(fn: () => void): Disposable {
    let disposed = false;
    return {
        dispose(): void {
            if (disposed) {
                return;
            }
            disposed = true;
            fn();
        },
    };
}

/**
 * Minimal typed event emitter for `src/core` (which must not import `vscode.EventEmitter`).
 *
 * Listener exceptions are isolated: a throwing listener is reported to `console.error` and the
 * remaining listeners still run, so one broken subscriber cannot silence the others.
 */
export class Emitter<T> implements Disposable {
    private listeners: Array<Listener<T>> = [];
    private disposed = false;

    readonly event: Event<T> = (listener: Listener<T>): Disposable => {
        if (this.disposed) {
            return toDisposable(() => undefined);
        }
        this.listeners.push(listener);
        return toDisposable(() => {
            const index = this.listeners.indexOf(listener);
            if (index >= 0) {
                this.listeners.splice(index, 1);
            }
        });
    };

    get listenerCount(): number {
        return this.listeners.length;
    }

    fire(value: T): void {
        if (this.disposed) {
            return;
        }
        // Snapshot so listeners that subscribe/unsubscribe during dispatch do not shift iteration.
        for (const listener of [...this.listeners]) {
            try {
                listener(value);
            } catch (error) {
                console.error('[nUIget] event listener threw', error);
            }
        }
    }

    dispose(): void {
        this.disposed = true;
        this.listeners = [];
    }
}
