import { useId } from 'react';
import type React from 'react';
import { busyText } from '../../../shared/installed/rules';
import { Badge, Button, GroupCaption, PropertyList, VerifiedIcon } from '../../../shared/primitives';
import { useAllProjects } from '../../../shared/store/allProjects';
import { useDetails, type DetailsSelection } from '../../../shared/store/details';
import { useInstalled } from '../../../shared/store/installed';
import { useOps } from '../../../shared/store/ops';
import { metadataKey, useTransitive } from '../../../shared/store/transitive';
import { aggregateTransitive, rootsByProject } from '../installed/transitiveAggregate';

/** One block of the Required by section: a heading (a framework or a project) when there are several, and its roots. */
interface Block {
    heading?: string;
    roots: string[];
}

/**
 * The details of a transitive package: the id with a Transitive badge, the version, the authors with the Verified mark, and
 * what requires it — one block per target framework of the project (headed when it has several), or one block per project
 * in All Projects. Everything comes from the transitive slices; nothing is asked of the feeds; no version selector or README.
 * In a single project one Install makes it a direct reference at the row's own version, through the pane's install path (the
 * CPM preview included); it stays shown and says why when it cannot (UX-P5.6, G6). All Projects is read-only.
 */
export function TransitiveDetails({ selection, onInstall, asking }: { selection: DetailsSelection; onInstall: () => void; asking: boolean }): React.JSX.Element {
    const transitive = useTransitive();
    const all = useAllProjects().transitive;
    const { stale } = useDetails();
    const installed = useInstalled();
    const ops = useOps();
    const noteId = useId();
    const key = metadataKey(selection.packageId, selection.version);
    const aggregate = selection.projectPath === null;
    const lite = (aggregate ? all.metadata : transitive.metadata).get(key);
    const sameEntry = (entry: { id: string; version: string }): boolean => metadataKey(entry.id, entry.version) === key;
    const captionId = useId();

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

    // Install goes to the committed project, so it is offered only for the selection of that one project (UX-P5.6, DO 5, 6).
    const projectPath = selection.projectPath;
    const busy = projectPath !== null && ops.isPackageBusy(projectPath, selection.packageId);
    let why: string | undefined;
    if (stale || projectPath !== installed.projectPath) {
        why = 'Checking the selected project';
    } else if (installed.result?.unsupported !== undefined) {
        why = `Unsupported project: ${installed.result.unsupported.message.replace(/\.+$/, '')}`;
    } else if (installed.result?.packages.some(entry => entry.id.toLowerCase() === selection.packageId.toLowerCase())) {
        why = 'Already a direct reference of this project';
    }
    // A row no longer listed says so once, in the info below, and that sentence describes the button.
    const blocked = why !== undefined || blocks === undefined;

    return (
        <div className="nuiget-details" data-testid="transitive-details">
            <div className="nuiget-details-header" data-testid="details-header">
                <h2 className="nuiget-details-title">
                    <span className="nuiget-details-name" title={selection.packageId}>{selection.packageId}</span>
                    {/* The space is for the heading's name ("… Transitive", not "…Transitive"); a flex item of white space is not drawn. */}
                    {' '}
                    <Badge label="Transitive" title="Installed through another package's dependencies" />
                </h2>
                <PropertyList items={[
                    { term: 'Version', value: selection.version },
                    ...(lite?.authors || lite?.verified ? [{
                        term: 'Authors',
                        value: <>
                            {lite.verified ? <><VerifiedIcon size={12} className="nuiget-verified" title="Verified: the package id prefix is reserved by its owner" />{' '}</> : null}
                            {lite.authors}
                        </>,
                    }] : []),
                ]} />
                {projectPath === null ? null : (
                    <div className="nuiget-details-actions">
                        <Button
                            data-testid="install-update-button"
                            disabled={busy || asking || blocked}
                            title={busy ? 'An operation on this package is running.' : blocked ? undefined : 'Install this version as a direct reference of the project.'}
                            aria-describedby={blocked ? noteId : undefined}
                            onClick={onInstall}
                        >
                            {busy ? busyText(ops, projectPath, selection.packageId) : 'Install'}
                        </Button>
                    </div>
                )}
                {why === undefined || projectPath === null ? null : <p className="nuiget-details-note" id={noteId}>{`${why}.`}</p>}
            </div>
            <div className="nuiget-details-info nuiget-details-info--continued">
                {blocks === undefined ? <p className="nuiget-details-note" id={why === undefined ? noteId : undefined}>No longer listed as a transitive package.</p> : (
                    <section aria-label="Required by" className="nuiget-details-section">
                        <GroupCaption title="Required by" />
                        {blocks.map((block, index) => {
                            const headingId = block.heading === undefined ? undefined : `${captionId}-${index}`;
                            return (
                                <div key={block.heading ?? index} className="nuiget-details-block">
                                    {block.heading === undefined ? null : <GroupCaption level={4} title={block.heading} id={headingId} testKey={`required-by-${block.heading.toLowerCase()}`} />}
                                    {block.roots.length === 0 ? <p className="nuiget-details-note">No traceable top-level package</p> : (
                                        <ul className="nuiget-details-list" aria-labelledby={headingId}>
                                            {block.roots.map(root => <li key={root}>{root}</li>)}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </section>
                )}
            </div>
        </div>
    );
}
