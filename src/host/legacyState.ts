/**
 * The storage 1.x left behind, removed without migration at every activation (ADR-000: users choose the project and
 * source once more). 2.0's own keys are not here: `nuiget.selectedProject` and the other session keys, the
 * `nuiget.layout.*` preferences, `nuiget.sdkVersionCache.v2` and the `TieredCache` entries its index lists.
 */

import type * as vscode from 'vscode';
import type { Logger } from '../core/contracts';
import { orphanedStoreKeys } from '../core/cache';
import { redact } from '../core/logging';

/** The 1.x keys of `workspaceState`. */
export const LEGACY_WORKSPACE_KEYS = [
    'nuget.includePrerelease',
    'nuget.recentSearches',
    'nuget.restoreEnabled',
    'nuget.restoreEnabledMigrated',
    'nuget.selectedProject',
    'nuget.selectedSource',
    'nuget.sidebarSectionSplit',
] as const;

/** The 1.x keys of `globalState`. */
export const LEGACY_GLOBAL_KEYS = ['nuget.splitPosition', 'nuiget.sdkVersionCache'] as const;

/**
 * Remove the 1.x keys and the cache entries no `TieredCache` can reach from both mementos. Runs before the cache and the
 * session store are constructed, so the index it reads is the previous session's. Writes only what exists and never
 * throws: a rejected removal is logged and the others go on.
 */
export async function sweepLegacyState(context: Pick<vscode.ExtensionContext, 'workspaceState' | 'globalState'>, logger: Logger): Promise<{ removed: string[] }> {
    const targets: Array<{ store: vscode.Memento; key: string }> = [
        ...LEGACY_WORKSPACE_KEYS.filter(key => context.workspaceState.get(key) !== undefined).map(key => ({ store: context.workspaceState, key })),
        ...LEGACY_GLOBAL_KEYS.filter(key => context.globalState.get(key) !== undefined).map(key => ({ store: context.globalState, key })),
        ...orphanedStoreKeys(context.workspaceState).map(key => ({ store: context.workspaceState, key })),
    ];
    const outcomes = await Promise.allSettled(targets.map(({ store, key }) => Promise.resolve(store.update(key, undefined))));
    const removed: string[] = [];
    outcomes.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') {
            removed.push(targets[index].key);
        } else {
            logger.warn(redact(`Legacy state ${targets[index].key} could not be removed: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`));
        }
    });
    if (removed.length > 0) {
        logger.info(`Removed ${removed.length} entries of 1.x state`);
    }
    return { removed };
}
