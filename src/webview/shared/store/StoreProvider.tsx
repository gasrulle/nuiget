import type React from 'react';
import type { Surface } from '../../../protocol';
import type { MessageBus } from '../bus/MessageBus';
import { MessageBusProvider } from '../bus/useMessageBus';
import { AllProjectsProvider } from './allProjects';
import { ConfigProvider } from './config';
import { DetailsProvider } from './details';
import { InstalledProvider } from './installed';
import { OpsProvider } from './ops';
import { ProjectsProvider } from './projects';
import { SearchProvider } from './search';
import { SessionProvider } from './session';
import { SourcesProvider } from './sources';
import { TransitiveProvider } from './transitive';
import { UpdatesProvider } from './updates';

/**
 * The store of a surface: the bus and the slices that exist so far, each with a context of its own, so that a
 * component renders for the slice it reads and no other. Mounting it is what makes the surface ask the host
 * for the session and the projects. `prefetch={false}` keeps the transitive slice from asking before a
 * view opens it (the sidebar shows no transitive packages). `surface` is the surface this store belongs to: an
 * operation its row menu ran carries it as the outcome's `origin`, and only this surface says it (UX-P4.fix-11).
 */
export function StoreProvider({ bus, children, prefetch = true, surface }: { bus: MessageBus; children: React.ReactNode; prefetch?: boolean; surface?: Surface }): React.JSX.Element {
    return (
        <MessageBusProvider bus={bus}>
            <SessionProvider>
                <ProjectsProvider>
                    <InstalledProvider>
                        <UpdatesProvider>
                            <TransitiveProvider prefetch={prefetch}>
                                <AllProjectsProvider>
                                    <ConfigProvider>
                                        <SourcesProvider>
                                            <SearchProvider>
                                                <DetailsProvider>
                                                    <OpsProvider surface={surface}>{children}</OpsProvider>
                                                </DetailsProvider>
                                            </SearchProvider>
                                        </SourcesProvider>
                                    </ConfigProvider>
                                </AllProjectsProvider>
                            </TransitiveProvider>
                        </UpdatesProvider>
                    </InstalledProvider>
                </ProjectsProvider>
            </SessionProvider>
        </MessageBusProvider>
    );
}
