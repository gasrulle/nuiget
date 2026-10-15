/**
 * One feed context per effective `nuget.config` chain (ADR-009 d.5): the sources listed for the chain's directory, the
 * merged configuration (package source mapping, credentials), the outbound policy and the policy-bound feed clients. A
 * project-scoped read reaches its chain through `ProjectContextProvider.get`, a read without a project through the
 * directory the host names. A directory's chain is read once (`dotnet nuget config paths`) and kept until `clear()`.
 *
 * Invariant: a credential for a source of directory D is asked only after `forDirectory(D)` or `forProject` has
 * settled, because `lookupConfigCredential` finds it among the registered chains and the credential provider remembers
 * a "none" answer for five minutes.
 */

import * as path from 'path';
import type { Logger, OutboundPolicy, SourceProvider } from '../contracts';
import type { NuGetSource } from '../../protocol/domain';
import { credentialForUrl } from '../credentials';
import { isRemoteSourceUrl, type ResolvedSource } from '../feeds';
import type { ProjectContextProvider } from '../project';
import { DefaultOutboundPolicy, mergeConfigChain, type ConfigCredential, type MergedNuGetConfig, type NuGetConfigReader } from '../sources';
import type { FeedClients, PolicyClients } from './feedClients';

export interface FeedContext {
    /** The chain, nearest first, joined by newlines; `''` for a directory without any `nuget.config`. */
    key: string;
    /** The directory the context was first built for; its source listing is the context's. */
    directory: string;
    configFiles: string[];
    sources: NuGetSource[];
    merged: MergedNuGetConfig;
    policy: OutboundPolicy;
    clients: PolicyClients;
}

export interface FeedContextsDeps {
    contexts: Pick<ProjectContextProvider, 'get' | 'configFilesFor'>;
    sources: SourceProvider;
    configs: Pick<NuGetConfigReader, 'readChain'>;
    feeds: FeedClients;
    logger?: Logger;
}

export interface ResolvedFeedSources {
    /** Enabled sources of the context, narrowed to the asked URLs when there are any. */
    selected: NuGetSource[];
    /** The remote members of `selected` with their endpoints and credentials. */
    resolved: ResolvedSource[];
    /** Remote members of `selected` that did not resolve: unhealthy, or no usable endpoint. */
    excluded: NuGetSource[];
}

export class FeedContexts {
    private readonly chains = new Map<string, Promise<string[]>>();
    private readonly contexts = new Map<string, Promise<FeedContext>>();
    private readonly settled = new Map<string, FeedContext>();

    constructor(private readonly deps: FeedContextsDeps) {}

    /** The context of a directory without a project. */
    async forDirectory(directory: string): Promise<FeedContext> {
        let chain = this.chains.get(directory);
        if (!chain) {
            chain = this.deps.contexts.configFilesFor(directory);
            this.chains.set(directory, chain);
        }
        return this.forChain(directory, await chain);
    }

    /** The context of a project; a context that cannot be built rejects and the caller decides. */
    async forProject(projectPath: string): Promise<FeedContext> {
        const directory = path.dirname(projectPath);
        const known = this.chains.get(directory);
        if (known) {
            return this.forChain(directory, await known);
        }
        const chain = this.deps.contexts.get(projectPath).then(({ context }) => context.configFiles);
        this.chains.set(directory, chain);
        chain.catch(() => {
            if (this.chains.get(directory) === chain) {
                this.chains.delete(directory);
            }
        });
        return this.forChain(directory, await chain);
    }

    /** The `nuget.config` credential of a source URL among the registered chains; the first chain that has one wins. */
    async lookupConfigCredential(sourceUrl: string): Promise<ConfigCredential | undefined> {
        for (const context of this.settled.values()) {
            const credential = credentialForUrl(sourceUrl, context.sources, context.merged);
            if (credential) {
                return credential;
            }
        }
        return undefined;
    }

    /** The context's enabled sources (or those of them named in `sourceUrls`), resolved through the shared service index. */
    async resolve(context: FeedContext, sourceUrls?: readonly string[], signal?: AbortSignal): Promise<ResolvedFeedSources> {
        const selected = context.sources.filter(source => source.enabled && (sourceUrls === undefined || sourceUrls.includes(source.url)));
        const resolved = await this.deps.feeds.serviceIndex.resolve(selected, signal);
        const resolvedUrls = new Set(resolved.map(source => source.source.url));
        const excluded = selected.filter(source => !source.isLocal && isRemoteSourceUrl(source.url) && !resolvedUrls.has(source.url));
        return { selected, resolved, excluded };
    }

    /** Forget every chain and context; their icon resolvers forget their breakers. */
    clear(): void {
        for (const context of this.settled.values()) {
            context.clients.icons.reset();
        }
        this.chains.clear();
        this.contexts.clear();
        this.settled.clear();
    }

    private forChain(directory: string, configFiles: string[]): Promise<FeedContext> {
        const key = configFiles.join('\n');
        let context = this.contexts.get(key);
        if (!context) {
            context = this.build(key, directory, configFiles);
            this.contexts.set(key, context);
            context.then(
                built => {
                    if (this.contexts.get(key) === context) {
                        this.settled.set(key, built);
                    }
                },
                () => {
                    if (this.contexts.get(key) === context) {
                        this.contexts.delete(key);
                    }
                },
            );
        }
        return context;
    }

    private async build(key: string, directory: string, configFiles: string[]): Promise<FeedContext> {
        if (key === '') {
            this.deps.logger?.debug(`No nuget.config chain for ${directory}: no mapping and no config credentials apply`);
        }
        const [sources, documents] = await Promise.all([this.deps.sources.listSources(directory), this.deps.configs.readChain(configFiles)]);
        const merged = mergeConfigChain(documents);
        const policy = new DefaultOutboundPolicy(merged.mapping);
        return { key, directory, configFiles, sources, merged, policy, clients: this.deps.feeds.forPolicy(policy) };
    }
}
