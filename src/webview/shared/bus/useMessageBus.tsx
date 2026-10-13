import { createContext, useContext } from 'react';
import type React from 'react';
import type { MessageBus } from './MessageBus';

const MessageBusContext = createContext<MessageBus | null>(null);

/** Gives the surface below it its one bus. The entry point creates the bus, because `acquireVsCodeApi` may be called once. */
export function MessageBusProvider({ bus, children }: { bus: MessageBus; children: React.ReactNode }): React.JSX.Element {
    return <MessageBusContext.Provider value={bus}>{children}</MessageBusContext.Provider>;
}

/** The bus of the surface: `request(type, payload, { signal, onChunk })` and `onEvent(type, handler)`. */
export function useMessageBus(): MessageBus {
    const bus = useContext(MessageBusContext);
    if (bus === null) {
        throw new Error('useMessageBus needs a MessageBusProvider above it');
    }
    return bus;
}
