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

interface StoreProps {
    bus: MessageBus;
    children: React.ReactNode;
    prefetch?: boolean;
    surface?: Surface;
}

/** The slices in their one order; `details` wraps the ops slice where the surface has a details pane. */
function Store({ bus, children, prefetch = true, surface, details: Details }: StoreProps & { details?: typeof DetailsProvider }): React.JSX.Element {
    const ops = <OpsProvider surface={surface}>{children}</OpsProvider>;
    return (
        <MessageBusProvider bus={bus}>
            <SessionProvider>
                <ProjectsProvider>
                    <InstalledProvider>
                        <UpdatesProvider>
                            <TransitiveProvider prefetch={prefetch}>
                                <AllProjectsProvider prefetchTransitive={prefetch}>
                                    <ConfigProvider>
                                        <SourcesProvider>
                                            <SearchProvider>{Details === undefined ? ops : <Details>{ops}</Details>}</SearchProvider>
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

/**
 * The store of a surface: the bus and the slices that exist so far, each with a context of its own, so that a
 * component renders for the slice it reads and no other. Mounting it is what makes the surface ask the host
 * for the session and the projects. `prefetch={false}` keeps the transitive slices from asking before a
 * view opens them: the single project's slice and the All Projects aggregate, which the main panel asks once the
 * projects' lists answered (UX-P5.1a; the sidebar shows no transitive packages). `surface` is the surface this store belongs to: an
 * operation its row menu ran carries it as the outcome's `origin`, and only this surface says it (UX-P4.fix-11).
 */
export function StoreProvider(props: StoreProps): React.JSX.Element {
    return <Store {...props} details={DetailsProvider} />;
}

/**
 * The sidebar's store: every slice but details, which only the main panel's details pane reads, so the sidebar bundle
 * leaves the slice out (UX-P4.8c).
 */
export function SidebarStoreProvider(props: StoreProps): React.JSX.Element {
    return <Store {...props} />;
}
