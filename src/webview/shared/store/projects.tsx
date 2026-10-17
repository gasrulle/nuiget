import { createContext, useContext, useEffect, useReducer } from 'react';
import type React from 'react';
import { ProtocolRequestError, resourceKeys, type Project } from '../../../protocol';
import { useMessageBus } from '../bus/useMessageBus';

export interface ProjectsState {
    /** `undefined` until the host has said what the projects are. */
    projects: readonly Project[] | undefined;
    /** Set when the first listing failed and no event has brought a list since. */
    error: ProtocolRequestError | undefined;
}

export type ProjectsAction =
    | { type: 'listed'; projects: Project[] }
    | { type: 'failed'; error: ProtocolRequestError };

export const INITIAL_PROJECTS: ProjectsState = { projects: undefined, error: undefined };

export function projectsReducer(state: ProjectsState, action: ProjectsAction): ProjectsState {
    switch (action.type) {
        case 'listed':
            return { projects: action.projects, error: undefined };
        case 'failed':
            // A list that is shown stays; the error is for the surface that has none.
            return state.projects === undefined ? { projects: undefined, error: action.error } : state;
    }
}

const ProjectsContext = createContext<ProjectsState | null>(null);

/**
 * The projects slice. The surface asks for the list when it starts; afterwards the host says when it changes
 * (`projects/changed`), and that event replaces the list as it is. The answer to the first request is dropped
 * when an invalidation has already listed a higher generation for `projects`: the event with the newer list
 * follows.
 */
export function ProjectsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const bus = useMessageBus();
    const [state, dispatch] = useReducer(projectsReducer, INITIAL_PROJECTS);

    useEffect(() => {
        let current = true;
        const unsubscribe = bus.onEvent('projects/changed', listing => dispatch({ type: 'listed', projects: listing.projects }));
        bus.request('projects/list', {}).then(answer => {
            const listed = bus.listedGeneration(resourceKeys.projects());
            const outOfDate = answer.generation !== undefined && listed !== undefined && answer.generation < listed;
            if (current && !outOfDate) {
                dispatch({ type: 'listed', projects: answer.result.projects });
            }
        }, (error: unknown) => {
            if (current) {
                dispatch({ type: 'failed', error: error instanceof ProtocolRequestError ? error : new ProtocolRequestError('failed', String(error)) });
            }
        });
        return () => {
            current = false;
            unsubscribe();
        };
    }, [bus]);

    return <ProjectsContext.Provider value={state}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsState {
    const state = useContext(ProjectsContext);
    if (state === null) {
        throw new Error('useProjects needs a ProjectsProvider above it');
    }
    return state;
}
