import type { OutboundPolicy } from '../contracts';
import type { NuGetSource } from '../../protocol/domain';
import { matchMapping } from './mapping';

/**
 * Which sources may be asked about a package id (ADR-005): only enabled ones, and with a package
 * source mapping only those that declare the winning pattern. When the winning pattern belongs to
 * sources that are disabled or not among the candidates, the id is sent nowhere; there is no
 * fallback to another pattern or to all sources. No source is treated specially by its address.
 *
 * One instance belongs to one project context: the mapping is that of the project's config chain.
 */
export class DefaultOutboundPolicy implements OutboundPolicy {
    constructor(private readonly mapping?: ReadonlyMap<string, readonly string[]>) {}

    allowedSourcesFor(packageId: string, candidates: NuGetSource[]): NuGetSource[] {
        const enabled = candidates.filter(candidate => candidate.enabled);
        if (this.mapping === undefined) {
            return enabled;
        }
        const allowed = matchMapping(this.mapping, packageId);
        return enabled.filter(candidate => allowed.has(candidate.name.toLowerCase()));
    }
}
