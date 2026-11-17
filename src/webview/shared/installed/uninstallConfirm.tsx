import { useCallback, useEffect, useState } from 'react';
import type React from 'react';
import { useMessageBus } from '../bus/useMessageBus';
import { ConfirmDialog } from '../primitives';
import { useConfig } from '../store/config';
import { useOpsActions } from '../store/ops';
import { useSession } from '../store/session';

/** The package the Delete key asks to uninstall, and from which project. */
export interface UninstallRequest {
    projectPath: string;
    /** The name the lists show for the project (under All Projects, the row's project). */
    projectName: string;
    packageId: string;
}

/** A surface's one Delete confirmation: the request its `UninstallConfirmDialog` shows, and what its buttons do. */
export interface UninstallConfirm {
    /** `null` while nothing is asked. */
    request: UninstallRequest | null;
    /** The Delete key on a row that can be uninstalled: asks first, unless the user said not to (`nuiget.confirmUninstall`). */
    ask: (request: UninstallRequest) => void;
    /** Cancel or Escape: nothing is sent, whatever the check box says. */
    close: () => void;
    /** Uninstall: with the box checked the setting is turned off first, then the package is uninstalled. */
    confirm: (doNotAsk: boolean) => void;
}

/**
 * The owner of the Delete key's confirmation (ADR-013 Decision 3, UX-P4.2a): the lists ask here and the shell mounts the
 * one `UninstallConfirmDialog` on `request`, as it does the central change. Only the key asks; the row button, the
 * details button and the menu name the action and uninstall at once. The setting is the only memory: an unknown
 * setting asks. A request belongs to the project it was asked in: a change of the committed project closes it.
 */
export function useUninstallConfirm(announce: (message: string) => void): UninstallConfirm {
    const bus = useMessageBus();
    const { run } = useOpsActions();
    const { config, enable } = useConfig();
    const [request, setRequest] = useState<UninstallRequest | null>(null);
    const committedProject = useSession().committed?.selectedProject;
    useEffect(() => enable(), [enable]);
    useEffect(() => setRequest(null), [committedProject]);

    const remove = useCallback((target: UninstallRequest): void => {
        run('ops/remove', { projectPath: target.projectPath, packageId: target.packageId }).catch((error: unknown) => {
            announce(`Uninstall of ${target.packageId} failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    }, [run, announce]);

    const ask = useCallback((next: UninstallRequest): void => {
        if (config?.confirmUninstall === false) {
            remove(next);
        } else {
            setRequest(next);
        }
    }, [config, remove]);
    const close = useCallback((): void => setRequest(null), []);
    const confirm = (doNotAsk: boolean): void => {
        const target = request;
        setRequest(null);
        if (target === null) {
            return;
        }
        if (doNotAsk) {
            // The new value returns as `config/changed`; a failed write leaves the setting on, and the next Delete asks.
            void bus.request('config/doNotConfirmUninstall', {}).catch(() => undefined);
        }
        remove(target);
    };

    return { request, ask, close, confirm };
}

/** The Delete key's confirmation; the check box starts unchecked at every open. */
export function UninstallConfirmDialog({ request, onClose, onConfirm }: { request: UninstallRequest | null; onClose: () => void; onConfirm: (doNotAsk: boolean) => void }): React.JSX.Element {
    const [doNotAsk, setDoNotAsk] = useState(false);
    useEffect(() => setDoNotAsk(false), [request]);
    return (
        <ConfirmDialog
            open={request !== null}
            title={request === null ? '' : `Uninstall ${request.packageId} from ${request.projectName}?`}
            confirmLabel="Uninstall"
            onConfirm={() => onConfirm(doNotAsk)}
            onCancel={onClose}
            doNotAsk={{ checked: doNotAsk, onChange: setDoNotAsk }}
        >
            Removes the package reference from the project file.
        </ConfirmDialog>
    );
}
