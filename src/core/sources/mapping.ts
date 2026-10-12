/**
 * Package source mapping: which sources declare the pattern that wins for a package id.
 *
 * A pattern is an exact id, a prefix that ends in `*`, or `*` alone. An exact id beats every prefix,
 * a longer prefix beats a shorter one, and `*` is the prefix of length zero. Every source that
 * declares the winning pattern is returned; no match returns nothing. Ids and patterns compare
 * without regard to case. Whether a source is enabled is not this function's concern.
 */
export function matchMapping(mapping: ReadonlyMap<string, readonly string[]>, packageId: string): Set<string> {
    const id = packageId.toLowerCase();
    let best = -1;
    let winners = new Set<string>();
    for (const [source, patterns] of mapping) {
        for (const pattern of patterns) {
            const rank = rankOf(pattern.toLowerCase(), id);
            if (rank > best) {
                best = rank;
                winners = new Set([source.toLowerCase()]);
            } else if (rank === best && rank >= 0) {
                winners.add(source.toLowerCase());
            }
        }
    }
    return winners;
}

/** -1 when the pattern does not match; otherwise the length of its prefix, and more than any prefix for an exact id. */
function rankOf(pattern: string, id: string): number {
    const star = pattern.indexOf('*');
    if (star === -1) {
        return pattern.length > 0 && pattern === id ? Number.POSITIVE_INFINITY : -1;
    }
    if (star !== pattern.length - 1) {
        return -1;
    }
    const prefix = pattern.slice(0, -1);
    return id.startsWith(prefix) ? prefix.length : -1;
}
