import { useEffect, useState } from 'react';
import type React from 'react';
import { useMessageBus } from '../../../shared/bus/useMessageBus';
import { IconButton, SettingsGearIcon } from '../../../shared/primitives';
import { useSession, useSessionActions } from '../../../shared/store/session';
import { useSources } from '../../../shared/store/sources';
import { SourceSettingsDialog } from './SourceSettingsDialog';

export interface SourcesControlProps {
    announce: (message: string) => void;
}

/**
 * The source of the shared context in the main panel's header (interaction model §1): a selector over All sources
 * and every enabled source, disabled until the list is known, and the button that opens the NuGet sources dialog,
 * which the host can also open (`ui/openSourceSettings`, from the sidebar or a command).
 */
export function SourcesControl({ announce }: SourcesControlProps): React.JSX.Element {
    const bus = useMessageBus();
    const { session } = useSession();
    const { set } = useSessionActions();
    const { sources, status, enable } = useSources();
    const [open, setOpen] = useState(false);

    // The selector needs the list whatever else is mounted.
    useEffect(() => enable(), [enable]);
    useEffect(() => bus.onEvent('ui/openSourceSettings', () => setOpen(true)), [bus]);

    const selected = session?.selectedSource ?? 'all';
    const enabled = (sources ?? []).filter(source => source.enabled);
    const known = enabled.some(source => source.url === selected);
    return (
        <>
            <select
                className="nuiget-main-select"
                data-testid="source-selector"
                aria-label="Package source"
                value={selected}
                disabled={session === undefined || status !== 'ready'}
                onChange={event => set({ selectedSource: event.target.value })}
            >
                <option value="all">All sources</option>
                {selected !== 'all' && !known ? <option value={selected}>{selected}</option> : null}
                {enabled.map(source => <option key={source.url} value={source.url} title={source.url}>{source.name}</option>)}
            </select>
            <IconButton label="NuGet sources" data-testid="source-settings" onClick={() => setOpen(true)}><SettingsGearIcon /></IconButton>
            <SourceSettingsDialog open={open} onClose={() => setOpen(false)} announce={announce} />
        </>
    );
}
