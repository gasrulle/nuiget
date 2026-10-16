import { useCallback, useEffect, useRef, useState } from 'react';
import { useMessageBus } from '../../../shared/bus/useMessageBus';
import { useInstalled } from '../../../shared/store/installed';
import { useOps, useOpsActions } from '../../../shared/store/ops';
import type { CentralUpdateRequest } from '../updates/CentralUpdateDialog';

/** A package version to install into the committed project. */
export interface InstallRequest {
    packageId: string;
    /** Always named: `dotnet package add` without a version writes a floating `*`. */
    version: string;
    sourceUrl?: string;
}

export interface InstallAction {
    install: (request: InstallRequest) => void;
    /** The `cpm/preview` of an install is being asked: the caller's install control waits. */
    asking: boolean;
    /** Stops a preview that is still being asked (another package selected). */
    cancel: () => void;
    /** The preview of an install that sets a central version, for the caller's `CentralUpdateDialog`. */
    preview: CentralUpdateRequest | null;
    closePreview: () => void;
    confirmPreview: () => void;
}

const sameId = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * The one way the main panel installs a package into the committed single project (the details pane's Install, the
 * Browse row's and the search box's Ctrl+Enter). It refuses, and says why, without a single project, while the
 * project's packages are not listed yet (whether it is a Central Package Management project is not known), when the
 * package is installed already, or while an operation on it runs. Into a CPM project it asks `cpm/preview` first and,
 * when the package has a central entry, hands the preview to the caller's dialog instead of installing (N77).
 */
export function useInstallAction(announce: (message: string) => void): InstallAction {
    const bus = useMessageBus();
    const installed = useInstalled();
    const { isPackageBusy } = useOps();
    const { run } = useOpsActions();
    const [asking, setAsking] = useState(false);
    const [preview, setPreview] = useState<CentralUpdateRequest | null>(null);
    const controller = useRef<AbortController | null>(null);

    const fail = useCallback((packageId: string) => (error: unknown): void => {
        announce(`Install of ${packageId} failed: ${error instanceof Error ? error.message : String(error)}`);
    }, [announce]);

    const cancel = useCallback((): void => {
        controller.current?.abort();
        controller.current = null;
        setAsking(false);
    }, []);
    useEffect(() => cancel, [cancel]);

    const target = installed.projectPath;
    const result = installed.result;
    const install = (request: InstallRequest): void => {
        const { packageId, version, sourceUrl } = request;
        if (target === null) {
            announce('Select a single project to install into.');
            return;
        }
        if (result === undefined) {
            announce('The packages of the selected project are not listed yet.');
            return;
        }
        const entry = result.packages.find(candidate => sameId(candidate.id, packageId));
        if (entry !== undefined) {
            announce(`${packageId} is already installed (${entry.resolvedVersion ?? entry.version}).`);
            return;
        }
        if (isPackageBusy(target, packageId) || asking) {
            return;
        }
        if (result.isCpm !== true) {
            run('ops/install', { projectPath: target, packageId, version, sourceUrl }).catch(fail(packageId));
            return;
        }
        // An install into a CPM project sets the central version when the package has a central entry already: the
        // projects it reaches are shown first (ADR-004 tier 3). Without an entry it changes this project only.
        const asked = new AbortController();
        controller.current = asked;
        setAsking(true);
        const central: CentralUpdateRequest = { kind: 'install', projectPath: target, packageId, toVersion: version, sourceUrl };
        bus.request('cpm/preview', { projectPath: target, packageId, version }, { signal: asked.signal }).then(
            ({ result: answer }) => {
                if (answer.preview === null) {
                    run('ops/install', { projectPath: target, packageId, version, sourceUrl }).catch(fail(packageId));
                } else {
                    setPreview(answer.preview.fromVersion === undefined ? central : { ...central, fromVersion: answer.preview.fromVersion });
                }
            },
            // Never install on an error: the dialog asks again and shows its own error with Retry.
            () => {
                if (!asked.signal.aborted) {
                    setPreview(central);
                }
            },
        ).finally(() => {
            if (controller.current === asked) {
                controller.current = null;
                setAsking(false);
            }
        });
    };

    const closePreview = (): void => setPreview(null);
    const confirmPreview = (): void => {
        const change = preview;
        setPreview(null);
        if (change !== null) {
            run('ops/install', { projectPath: change.projectPath, packageId: change.packageId, version: change.toVersion, sourceUrl: change.sourceUrl }).catch(fail(change.packageId));
        }
    };

    return { install, asking, cancel, preview, closePreview, confirmPreview };
}
