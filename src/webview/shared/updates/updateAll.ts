import type { AllProjectsUpdates } from '../store/allProjects';
import type { UpdatesState } from '../store/updates';

/**
 * What a surface knows of its updates: `known` once the host answered for every project it lists and every source was
 * checked; otherwise why not. The Updates tab's badge, both main toolbars and the sidebar's Update All read it, so a
 * count is shown only where the list is known (MU6; UX-P3.11, design-advisor opening ruling DO 5).
 */
export type UpdatesKnowledge = 'known' | 'loading' | 'error' | 'unavailable';

/** One project's updates. A ready list stays known while a revalidation failed: its rows are still the host's answer. */
export function singleKnowledge(updates: Pick<UpdatesState, 'status' | 'sourcesUnavailable' | 'error'>): UpdatesKnowledge {
    if (updates.sourcesUnavailable) {
        return 'unavailable';
    }
    if (updates.status === 'ready') {
        return 'known';
    }
    return updates.status === 'error' || updates.error !== undefined ? 'error' : 'loading';
}

/** All Projects: known once every listed project answered without an error and every source was checked. */
export function allProjectsKnowledge(all: Pick<AllProjectsUpdates, 'status' | 'sourcesUnavailable' | 'error' | 'projects' | 'chunks'>): UpdatesKnowledge {
    if (all.sourcesUnavailable) {
        return 'unavailable';
    }
    const chunks = (all.projects ?? []).map(project => all.chunks.get(project.path));
    // As for one project, a ready stream stays known while a revalidation failed; a project's own error is unknown.
    if (all.status === 'error' || (all.status !== 'ready' && all.error !== undefined) || chunks.some(chunk => chunk?.error !== undefined)) {
        return 'error';
    }
    return all.status === 'ready' && chunks.every(chunk => chunk !== undefined) ? 'known' : 'loading';
}

/** Why a bulk update cannot start while the list is not known, as a sentence on the disabled control (DS-STATE-7). */
const UNKNOWN_WHY: Record<Exclude<UpdatesKnowledge, 'known'>, string> = {
    loading: 'Updates are being checked.',
    error: 'The updates could not be checked.',
    unavailable: 'Some package sources could not be checked.',
};

/** The disabled title of a bulk control with no candidate. */
export function noCandidateWhy(knowledge: UpdatesKnowledge): string {
    return knowledge === 'known' ? 'No update in this list can join a bulk update.' : UNKNOWN_WHY[knowledge];
}

export interface BulkUpdateButton {
    label: string;
    disabled: boolean;
    title: string | undefined;
}

/** The Updates toolbar's primary: a count only while the list is known (the table of the opening ruling, DO 5). */
export function bulkUpdateButton(chosen: number, candidates: number, knowledge: UpdatesKnowledge): BulkUpdateButton {
    if (chosen > 0) {
        return { label: `Update Selected (${chosen})`, disabled: false, title: undefined };
    }
    const label = knowledge === 'known' ? `Update All (${candidates})` : 'Update All';
    return candidates > 0 ? { label, disabled: false, title: undefined } : { label, disabled: true, title: noCandidateWhy(knowledge) };
}
