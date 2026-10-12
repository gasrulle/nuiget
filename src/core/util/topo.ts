/**
 * Order `items` so that dependencies precede dependents (`dependenciesFirst: true`, used for
 * installs/updates) or dependents precede dependencies (`false`, used for removals).
 *
 * Kahn's algorithm over the edges in `dependencyMap` (lower-cased key → lower-cased dependency
 * keys) restricted to `selectedKeys`. Items that take part in a cycle, or are missing from the
 * graph, are appended in their original order so every distinct key appears exactly once.
 */
export function topologicalSortByDependency<T>(
    items: T[],
    getKey: (item: T) => string,
    dependencyMap: Map<string, string[]>,
    selectedKeys: Set<string>,
    dependenciesFirst: boolean,
): T[] {
    const inDegree = new Map<string, number>();
    const edges = new Map<string, string[]>();
    const byKey = new Map<string, T>();

    for (const item of items) {
        const key = getKey(item);
        inDegree.set(key, 0);
        edges.set(key, []);
        if (!byKey.has(key)) {
            byKey.set(key, item);
        }
    }

    for (const item of items) {
        const key = getKey(item);
        for (const dep of dependencyMap.get(key) ?? []) {
            if (!selectedKeys.has(dep) || !inDegree.has(dep) || dep === key) {
                continue;
            }
            const [from, to] = dependenciesFirst ? [dep, key] : [key, dep];
            inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
            edges.get(from)?.push(to);
        }
    }

    const queue: string[] = [];
    for (const [key, degree] of inDegree) {
        if (degree === 0) {
            queue.push(key);
        }
    }

    const sortedKeys: string[] = [];
    while (queue.length > 0) {
        const key = queue.shift();
        if (key === undefined) {
            break;
        }
        sortedKeys.push(key);
        for (const target of edges.get(key) ?? []) {
            const degree = (inDegree.get(target) ?? 1) - 1;
            inDegree.set(target, degree);
            if (degree === 0) {
                queue.push(target);
            }
        }
    }

    const emitted = new Set<string>();
    const sorted: T[] = [];
    for (const key of sortedKeys) {
        const item = byKey.get(key);
        if (item !== undefined && !emitted.has(key)) {
            emitted.add(key);
            sorted.push(item);
        }
    }

    for (const item of items) {
        const key = getKey(item);
        if (!emitted.has(key)) {
            emitted.add(key);
            sorted.push(item);
        }
    }

    return sorted;
}
