import { useCallback, useEffect, useRef, useState } from 'react';
import { useMessageBus } from '../../../shared/bus/useMessageBus';
import { useInstalled } from '../../../shared/store/installed';
import { useOps, useOpsActions } from '../../../shared/store/ops';
import type { CentralUpdateRequest } from '../updates/CentralUpdateDialog';
import type { CentralChange } from '../updates/useCentralChange';

/** A package version to install into the committed project. */
export interface InstallRequest {
    packageId: string;
    /** Always named: `dotnet package add` without a version writes a floating `*`. */
    version: string;
    sourceUrl?: string;
}

export interface InstallAction {
    /** Starts the install; returns the cancel of the `cpm/preview` it asks (a no-op when it asked none or once that settled). */
    install: (request: InstallRequest) => () => void;
    /** False, and the live region says why, when an install of the package cannot start now (before asking its version). */
    check: (packageId: string) => boolean;
    /** The `cpm/preview` of an install is being asked: every install control of the panel waits (one ask at a time). */
    asking: boolean;
    /** Stops whatever preview is still being asked, whoever asked it. */
    cancel: () => void;
}

const NOTHING_TO_CANCEL = (): void => undefined;

const sameId = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * The one way the main panel installs a package into the committed single project (the details pane's Install, the
 * Browse row's and the search box's Ctrl+Enter). It refuses, and says why, without a single project, while the
 * project's packages are not listed yet (whether it is a Central Package Management project is not known), when the
 * package is installed already, or while an operation on it runs. Into a CPM project it asks `cpm/preview` first and,
 * when the package has a central entry, hands the change to `ask` (the shell's central-change dialog) instead of
 * installing (N77). The shell holds the one instance, so one preview is asked at a time (X53).
 */
export function useInstallAction(announce: (message: string) => void, ask: CentralChange['ask']): InstallAction {
    const bus = useMessageBus();
    const installed = useInstalled();
    const { isPackageBusy } = useOps();
    const { run } = useOpsActions();
    const [asking, setAsking] = useState(false);
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
    const check = (packageId: string): boolean => {
        if (target === null) {
            announce('Select a single project to install into.');
            return false;
        }
        if (result === undefined) {
            announce('The packages of the selected project are not listed yet.');
            return false;
        }
        const entry = result.packages.find(candidate => sameId(candidate.id, packageId));
        if (entry !== undefined) {
            announce(`${packageId} is already installed (${entry.resolvedVersion ?? entry.version}).`);
            return false;
        }
        return !isPackageBusy(target, packageId) && !asking;
    };

    const install = (request: InstallRequest): (() => void) => {
        const { packageId, version, sourceUrl } = request;
        if (!check(packageId) || target === null || result === undefined) {
            return NOTHING_TO_CANCEL;
        }
        if (result.isCpm !== true) {
            run('ops/install', { projectPath: target, packageId, version, sourceUrl }).catch(fail(packageId));
            return NOTHING_TO_CANCEL;
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
                    ask(answer.preview.fromVersion === undefined ? central : { ...central, fromVersion: answer.preview.fromVersion });
                }
            },
            // Never install on an error: the dialog asks again and shows its own error with Retry.
            () => {
                if (!asked.signal.aborted) {
                    ask(central);
                }
            },
        ).finally(() => {
            if (controller.current === asked) {
                controller.current = null;
                setAsking(false);
            }
        });
        // This ask's own cancel: another caller's ask, or one that settled, is left alone.
        return () => {
            if (controller.current === asked) {
                asked.abort();
                controller.current = null;
                setAsking(false);
            }
        };
    };

    return { install, check, asking, cancel };
}
