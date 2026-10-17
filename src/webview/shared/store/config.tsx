import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import type { ExtensionConfig } from '../../../protocol';
import { useMessageBus } from '../bus/useMessageBus';

export interface ConfigState {
    /** The extension's settings as the host reads them; `undefined` until known. */
    config: ExtensionConfig | undefined;
    /** A consumer needs the settings: `config/get` is asked once, unless `config/changed` said them already. */
    enable: () => void;
}

const ConfigContext = createContext<ConfigState | null>(null);

/**
 * The config slice: the settings the host sends with `config/changed` (always applied) and answers to `config/get`.
 * Lazy like the sources slice: a surface that never reads a setting never asks. ADR-008's enumeration of slices has
 * no `config`; it was added with its first consumer, the main panel's quick-search (P5.6).
 */
export function ConfigProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const bus = useMessageBus();
    const [config, setConfig] = useState<ExtensionConfig>();
    const [enabled, setEnabled] = useState(false);
    const known = config !== undefined;

    useEffect(() => bus.onEvent('config/changed', setConfig), [bus]);

    useEffect(() => {
        if (!enabled || known) {
            return undefined;
        }
        const controller = new AbortController();
        // A failed read leaves the settings unknown; the next `config/changed` brings them.
        bus.request('config/get', {}, { signal: controller.signal }).then(({ result }) => setConfig(previous => previous ?? result), () => undefined);
        return () => controller.abort();
    }, [bus, enabled, known]);

    const enable = useCallback((): void => setEnabled(true), []);
    const state = useMemo<ConfigState>(() => ({ config, enable }), [config, enable]);
    return <ConfigContext.Provider value={state}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigState {
    const state = useContext(ConfigContext);
    if (state === null) {
        throw new Error('useConfig needs a ConfigProvider above it');
    }
    return state;
}
