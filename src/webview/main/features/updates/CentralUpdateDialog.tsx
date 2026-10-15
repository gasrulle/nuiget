import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { CpmImpactPreview } from '../../../../protocol';
import { useMessageBus } from '../../../shared/bus/useMessageBus';
import { Dialog } from '../../../shared/primitives';
import { useProjects } from '../../../shared/store/projects';

/** The central change the user asked for; the owner of the dialog runs it on confirm. */
export interface CentralUpdateRequest {
    projectPath: string;
    packageId: string;
    fromVersion: string;
    toVersion: string;
    sourceUrl?: string;
}

export interface CentralUpdateDialogProps {
    /** `null` when the dialog is closed. */
    request: CentralUpdateRequest | null;
    onClose: () => void;
    onConfirm: () => void;
}

type PreviewState =
    | { status: 'loading' }
    | { status: 'ready'; preview: CpmImpactPreview | null }
    | { status: 'error'; message: string };

const lastSegment = (projectPath: string): string => projectPath.split(/[\\/]/).pop() ?? projectPath;

/**
 * What updating a centrally managed package changes (interaction model §5, "CPM central change"): the host's preview
 * (`cpm/preview`) lists every project the central version applies to before anything is submitted, and the one action
 * is *Update central version* (overriding the version in one project waits for finding N74). The request is cancelled
 * when the dialog closes.
 */
export function CentralUpdateDialog({ request, onClose, onConfirm }: CentralUpdateDialogProps): React.JSX.Element | null {
    const bus = useMessageBus();
    const { projects } = useProjects();
    const cancelRef = useRef<HTMLButtonElement>(null);
    const [state, setState] = useState<PreviewState>({ status: 'loading' });
    const [attempt, setAttempt] = useState(0);

    const projectPath = request?.projectPath;
    const packageId = request?.packageId;
    const toVersion = request?.toVersion;
    useEffect(() => {
        if (projectPath === undefined || packageId === undefined || toVersion === undefined) {
            return undefined;
        }
        const controller = new AbortController();
        setState({ status: 'loading' });
        bus.request('cpm/preview', { projectPath, packageId, version: toVersion }, { signal: controller.signal }).then(
            ({ result }) => setState({ status: 'ready', preview: result.preview }),
            (error: unknown) => {
                if (!controller.signal.aborted) {
                    setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
                }
            },
        );
        return () => controller.abort();
    }, [bus, projectPath, packageId, toVersion, attempt]);

    const nameOf = (path: string): string => projects?.find(project => project.path === path)?.name ?? lastSegment(path);

    let body: React.ReactNode;
    if (state.status === 'loading') {
        body = <p className="nuiget-bulk-lead">Looking up the projects that use the central version…</p>;
    } else if (state.status === 'error') {
        body = (
            <div role="alert">
                <p className="nuiget-bulk-lead">{`The projects this change reaches could not be listed: ${state.message}`}</p>
                <button type="button" className="nuiget-button nuiget-button--secondary" onClick={() => setAttempt(value => value + 1)}>Retry</button>
            </div>
        );
    } else if (state.preview === null) {
        body = <p className="nuiget-bulk-lead">The central entry was not found; the update changes this project only.</p>;
    } else {
        body = (
            <>
                <p className="nuiget-bulk-lead">{`Changes the central version ${state.preview.fromVersion ?? '(none)'} → ${state.preview.toVersion} in Directory.Packages.props for:`}</p>
                <ul className="nuiget-bulk-list">
                    {state.preview.affectedProjects.map(path => <li key={path}>{nameOf(path)}</li>)}
                </ul>
            </>
        );
    }

    return (
        <Dialog
            open={request !== null}
            onClose={onClose}
            title={request ? `${request.packageId} is centrally managed` : ''}
            description={request ? `Its version is set in Directory.Packages.props for every project that uses it: ${request.fromVersion} → ${request.toVersion}.` : undefined}
            role="alertdialog"
            initialFocus={cancelRef}
            data-testid="cpm-preview-dialog"
            footer={<>
                <button ref={cancelRef} type="button" className="nuiget-button nuiget-button--secondary" onClick={onClose}>Cancel</button>
                <button type="button" className="nuiget-button" data-testid="cpm-preview-confirm" disabled={state.status !== 'ready'} onClick={onConfirm}>Update central version</button>
            </>}
        >
            {body}
        </Dialog>
    );
}
