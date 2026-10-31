import type React from 'react';
import { Badge } from './Badge';
import { ChevronRightIcon } from './icons';
import { Spinner } from './Spinner';
import './primitives.css';

/** The header of a collapsible section. */
interface SectionModeProps {
    presentation?: 'section';
    title: string;
    /** The id of the title text. A `Listbox` in the section is named by it (`labelledBy`). */
    titleId: string;
    expanded: boolean;
    onToggle: () => void;
    /** The id of the element the toggle shows and hides. It is in the document while the section is expanded. */
    contentId: string;
    /** The section's name in its test id: `section-header-<testKey>`. */
    testKey: string;
    /** The heading level: 2 under the title of the view, 3 inside another section, 4 for a group inside a section of the details pane. */
    level?: 2 | 3 | 4;
    /** A number is the count badge at the header's end (DS-COPY-5); the text `k of N` while a filter is on, in the badge's place, never both. Read as part of the toggle's name. */
    count?: number | string;
    /** The section is loading or revalidating: a spinner turns next to the title. */
    busy?: boolean;
    /** `Badge`s after the title; text, never a control. */
    badges?: React.ReactNode;
    /** `IconButton`s of the section. They are beside the toggle, never inside it. */
    actions?: React.ReactNode;
    /** A tooltip on the toggle, for example a project's path. */
    tooltip?: string;
    /**
     * What the header heads, written as `data-variant` on its box (`section-box-<testKey>`): `pane` for a sidebar
     * section, `group` for a project or a group of a list, `level` for a nested level such as a target framework.
     */
    variant?: 'pane' | 'group' | 'level';
}

/** The content of a group row's treeitem (UX-P2.1c, UX-P2.1d); the list owns the role, the name and `aria-expanded`. */
interface ContentModeProps {
    presentation: 'content';
    title: string;
    testKey: string;
    expanded: boolean;
    /** A number is the count badge at the header's end (DS-COPY-5); the text `k of N` while a filter is on, in the badge's place, never both. */
    count?: number | string;
    busy?: boolean;
    variant?: 'pane' | 'group' | 'level';
    /** `Badge`s after the title; text, never a control. */
    badges?: React.ReactNode;
}

export type SectionHeaderProps = SectionModeProps | ContentModeProps;

/**
 * The header of a collapsible section: a heading whose content is one button that expands and collapses the
 * section. The section's own buttons are siblings of the heading, because a button inside a button is nested
 * interactive content, which assistive technology cannot reach.
 */
export function SectionHeader(props: SectionHeaderProps): React.JSX.Element {
    if (props.presentation === 'content') {
        const { title, testKey, expanded, count, busy, variant, badges } = props;
        return (
            <div className="nuiget-section-header" data-testid={`section-box-${testKey}`} data-variant={variant}>
                <span className="nuiget-section-heading">
                    <span className="nuiget-section-toggle" data-testid={`section-header-${testKey}`}>
                        <ChevronRightIcon className={chevronClass(expanded)} />
                        <span className="nuiget-section-title">{title}</span>
                        {busy ? <Spinner /> : null}
                    </span>
                </span>
                {/* The spaces are for the treeitem's name, taken from content: without them it reads "Direct packages3". A flex item of white space is not drawn. */}
                {badges ? <>{' '}<div className="nuiget-section-badges">{badges}</div></> : null}
                {count === undefined ? null : <>{' '}<SectionCount count={count} /></>}
            </div>
        );
    }
    const { title, titleId, expanded, onToggle, contentId, testKey, level = 2, count, busy, badges, actions, tooltip, variant = 'group' } = props;
    const Heading = `h${level}` as const;
    const countId = `${titleId}-count`;
    const name = count === undefined ? titleId : `${titleId} ${countId}`;
    return (
        <div className="nuiget-section-header" data-testid={`section-box-${testKey}`} data-variant={variant}>
            <Heading className="nuiget-section-heading" aria-labelledby={name}>
                <button
                    type="button"
                    className="nuiget-section-toggle"
                    aria-expanded={expanded}
                    aria-controls={contentId}
                    aria-labelledby={name}
                    title={tooltip}
                    data-testid={`section-header-${testKey}`}
                    onClick={onToggle}
                >
                    <ChevronRightIcon className={chevronClass(expanded)} />
                    <span className="nuiget-section-title" id={titleId}>{title}</span>
                    {busy ? <Spinner /> : null}
                </button>
            </Heading>
            {badges ? <div className="nuiget-section-badges">{badges}</div> : null}
            {actions ? <div className="nuiget-section-actions">{actions}</div> : null}
            <SectionCount count={count} id={countId} />
        </div>
    );
}

const chevronClass = (expanded: boolean): string => `nuiget-section-chevron${expanded ? ' nuiget-section-chevron--expanded' : ''}`;

/** The end slot of the anatomy: a count badge, or `k of N` in its place while a filter is on (DS-COPY-5). */
function SectionCount({ count, id }: { count: number | string | undefined; id?: string }): React.JSX.Element | null {
    if (count === undefined) {
        return null;
    }
    return (
        <span className="nuiget-section-count" id={id}>
            {typeof count === 'number' ? <Badge kind="count" label={String(count)} /> : <span className="nuiget-section-count-text">{count}</span>}
        </span>
    );
}
