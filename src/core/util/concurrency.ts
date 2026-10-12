/**
 * Promise concurrency helpers shared by the feed clients: a bounded sliding window over a list
 * of items and a "first match wins" race that never rejects.
 */

/**
 * Run `worker` over `items` with at most `concurrency` calls in flight. Each worker slot picks up
 * the next item as soon as it finishes, so a slow item never stalls the others. Results keep the
 * input order; `onProgress` fires in completion order.
 *
 * A rejected worker stops new items from being scheduled and rejects the returned promise with
 * the first error once the items already in flight have settled.
 */
export async function batchedPromiseAll<T, R>(
    items: readonly T[],
    worker: (item: T, index: number) => Promise<R>,
    concurrency: number,
    onProgress?: (result: R, index: number) => void,
): Promise<R[]> {
    const results: R[] = new Array<R>(items.length);
    const limit = Number.isFinite(concurrency) ? Math.max(1, Math.floor(concurrency)) : 1;
    let nextIndex = 0;
    let failure: { error: unknown } | undefined;

    const runSlot = async (): Promise<void> => {
        while (nextIndex < items.length && failure === undefined) {
            const index = nextIndex++;
            try {
                const result = await worker(items[index], index);
                results[index] = result;
                onProgress?.(result, index);
            } catch (error) {
                failure ??= { error };
            }
        }
    };

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runSlot()));
    if (failure !== undefined) {
        throw failure.error;
    }
    return results;
}

/**
 * Resolve with the first settled promise (in completion order) whose value satisfies `predicate`,
 * together with its index in `promises`. Rejections and predicate exceptions count as
 * non-matching. When nothing matches, resolves `{ value: fallback, index: -1 }` after every
 * promise has settled. Never rejects.
 */
export function raceFirst<T>(
    promises: ReadonlyArray<Promise<T>>,
    predicate: (value: T) => boolean,
    fallback: T,
): Promise<{ value: T; index: number }> {
    return new Promise(resolve => {
        if (promises.length === 0) {
            resolve({ value: fallback, index: -1 });
            return;
        }

        let settled = false;
        let remaining = promises.length;

        const settleNonMatching = (): void => {
            remaining--;
            if (remaining === 0 && !settled) {
                settled = true;
                resolve({ value: fallback, index: -1 });
            }
        };

        promises.forEach((promise, index) => {
            promise.then(
                value => {
                    if (settled) {
                        return;
                    }
                    let matched: boolean;
                    try {
                        matched = predicate(value);
                    } catch {
                        matched = false;
                    }
                    if (matched) {
                        settled = true;
                        resolve({ value, index });
                        return;
                    }
                    settleNonMatching();
                },
                () => {
                    if (!settled) {
                        settleNonMatching();
                    }
                },
            );
        });
    });
}
