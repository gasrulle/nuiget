import type React from 'react';
import { Badge, VerifiedIcon } from '../../../shared/primitives';
import { useAllProjects } from '../../../shared/store/allProjects';
import type { DetailsSelection } from '../../../shared/store/details';
import { metadataKey, useTransitive } from '../../../shared/store/transitive';
import { aggregateTransitive, rootsByProject } from '../installed/AllProjectsTransitiveSection';

/** One block of the Required by section: a heading (a framework or a project) when there are several, and its roots. */
interface Block {
    heading?: string;
    roots: string[];
}

/**
 * The details of a transitive package, read-only as 1.x showed them: the id with a Transitive badge, the version, the
 * authors with the Verified mark, and what requires it — one block per target framework of the project (headed when it
 * has several), or one block per project in All Projects. Everything comes from the transitive slices; nothing is asked
 * of the feeds, and there is no version selector, action or README.
 */
export function TransitiveDetails({ selection }: { selection: DetailsSelection }): React.JSX.Element {
    const transitive = useTransitive();
    const all = useAllProjects().transitive;
    const key = metadataKey(selection.packageId, selection.version);
    const aggregate = selection.projectPath === null;
    const lite = (aggregate ? all.metadata : transitive.metadata).get(key);
    const sameEntry = (entry: { id: string; version: string }): boolean => metadataKey(entry.id, entry.version) === key;

    let blocks: Block[] | undefined;
    if (aggregate) {
        const row = aggregateTransitive(all.chunks.values()).find(sameEntry);
        blocks = row === undefined ? undefined : rootsByProject(row.origins).map(({ projectName, roots }) => ({ heading: projectName, roots }));
    } else if (transitive.result !== undefined && transitive.projectPath === selection.projectPath) {
        const frameworks = transitive.result.frameworks;
        const listing = frameworks.flatMap(framework => framework.packages.filter(sameEntry).map(entry => ({
            heading: frameworks.length > 1 ? framework.targetFramework : undefined,
            roots: [...new Set(entry.fullChain ?? entry.requiredByChain)],
        })));
        blocks = listing.length === 0 ? undefined : listing;
    }

    return (
        <div className="nuiget-details" data-testid="transitive-details">
            <div className="nuiget-details-header">
                <h2 className="nuiget-details-title">
                    {selection.packageId}
                    {' '}
                    <Badge label="Transitive" title="Installed through another package's dependencies" />
                </h2>
            </div>
            <div className="nuiget-details-info">
                <div className="nuiget-details-row">
                    <span className="nuiget-details-label">Version:</span>
                    <span>{selection.version}</span>
                </div>
                {lite?.authors || lite?.verified ? (
                    <div className="nuiget-details-row">
                        <span className="nuiget-details-label">Authors:</span>
                        <span>
                            {lite.verified ? <><VerifiedIcon title="Verified: the package id prefix is reserved by its owner" />{' '}</> : null}
                            {lite.authors}
                        </span>
                    </div>
                ) : null}
                {blocks === undefined ? <p className="nuiget-details-note">No longer listed as a transitive package.</p> : (
                    <section aria-label="Required by" className="nuiget-details-section">
                        <h3>Required by</h3>
                        {blocks.map((block, index) => (
                            <div key={block.heading ?? index} className="nuiget-details-group">
                                {block.heading === undefined ? null : <h4>{block.heading}</h4>}
                                {block.roots.length === 0 ? <p>No traceable top-level package</p> : (
                                    <ul className="nuiget-details-list">
                                        {block.roots.map(root => <li key={root}>{root}</li>)}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </section>
                )}
            </div>
        </div>
    );
}
