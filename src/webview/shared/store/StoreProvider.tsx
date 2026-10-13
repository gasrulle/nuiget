import type React from 'react';
import type { MessageBus } from '../bus/MessageBus';
import { MessageBusProvider } from '../bus/useMessageBus';
import { InstalledProvider } from './installed';
import { OpsProvider } from './ops';
import { ProjectsProvider } from './projects';
import { SessionProvider } from './session';

/**
 * The store of a surface: the bus and the slices that exist so far, each with a context of its own, so that a
 * component renders for the slice it reads and no other. Mounting it is what makes the surface ask the host
 * for the session and the projects.
 */
export function StoreProvider({ bus, children }: { bus: MessageBus; children: React.ReactNode }): React.JSX.Element {
    return (
        <MessageBusProvider bus={bus}>
            <SessionProvider>
                <ProjectsProvider>
                    <InstalledProvider>
                        <OpsProvider>{children}</OpsProvider>
                    </InstalledProvider>
                </ProjectsProvider>
            </SessionProvider>
        </MessageBusProvider>
    );
}
