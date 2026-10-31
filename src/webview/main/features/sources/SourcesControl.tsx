import { useEffect, useState } from 'react';
import type React from 'react';
import { useMessageBus } from '../../../shared/bus/useMessageBus';
import { IconButton, Select, SettingsGearIcon, WarningIcon } from '../../../shared/primitives';
import { useSession, useSessionActions } from '../../../shared/store/session';
import { useSources } from '../../../shared/store/sources';
import { SourceSettingsDialog } from './SourceSettingsDialog';

export interface SourcesControlProps {
    announce: (message: string) => void;
}

/**
 * The source of the shared context in the main panel's header (interaction model §1): a selector over All sources
 * and every enabled source, disabled until the list is known, and the button that opens the NuGet sources dialog,
 * which the host can also open (`ui/openSourceSettings`, from the sidebar or a command). A source the host could not
 * reach is marked "(unreachable)" with its error as the tooltip, and a warning button retries through `sources/refresh`,
 * which resets the health tracker; the list follows through `sources/health`.
 */
export function SourcesControl({ announce }: SourcesControlProps): React.JSX.Element {
    const bus = useMessageBus();
    const { session } = useSession();
    const { set } = useSessionActions();
    const { sources, failed, status, enable } = useSources();
    const [open, setOpen] = useState(false);

    // The selector needs the list whatever else is mounted.
    useEffect(() => enable(), [enable]);
    useEffect(() => bus.onEvent('ui/openSourceSettings', () => setOpen(true)), [bus]);

    const selected = session?.selectedSource ?? 'all';
    const enabled = (sources ?? []).filter(source => source.enabled);
    const known = enabled.some(source => source.url === selected);
    const failedByUrl = new Map(failed.map(source => [source.url, source.error]));
    return (
        <>
            <Select
                data-testid="source-selector"
                aria-label="Package source"
                value={selected}
                disabled={session === undefined || status !== 'ready'}
                onChange={value => set({ selectedSource: value })}
            >
                <option value="all">All sources</option>
                {selected !== 'all' && !known ? <option value={selected}>{selected}</option> : null}
                {enabled.map(source => (
                    <option key={source.url} value={source.url} title={failedByUrl.get(source.url) ?? source.url}>
                        {failedByUrl.has(source.url) ? `${source.name} (unreachable)` : source.name}
                    </option>
                ))}
            </Select>
            <IconButton label="NuGet sources" data-testid="source-settings" onClick={() => setOpen(true)}><SettingsGearIcon /></IconButton>
            {failed.length > 0 ? (
                <span className="nuiget-source-health"><IconButton
                    label={`${failed.length} source${failed.length === 1 ? '' : 's'} unreachable. Retry`}
                    data-testid="source-health-indicator"
                    onClick={() => {
                        bus.request('sources/refresh', {}).catch(() => undefined);
                    }}
                >
                    <WarningIcon />
                </IconButton></span>
            ) : null}
            <SourceSettingsDialog open={open} onClose={() => setOpen(false)} announce={announce} />
        </>
    );
}
