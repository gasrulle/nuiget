import type React from 'react';
import { Badge } from './Badge';
import { ChevronRightIcon } from './icons';
import { Spinner } from './Spinner';
import './primitives.css';

export interface SectionHeaderProps {
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
    /** Shown as a badge after the title and read as part of the toggle's name. */
    count?: number;
    /** The section is loading or revalidating: a spinner turns next to the title. */
    busy?: boolean;
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

/**
 * The header of a collapsible section: a heading whose content is one button that expands and collapses the
 * section. The section's own buttons are siblings of the heading, because a button inside a button is nested
 * interactive content, which assistive technology cannot reach.
 */
export function SectionHeader({ title, titleId, expanded, onToggle, contentId, testKey, level = 2, count, busy, actions, tooltip, variant = 'group' }: SectionHeaderProps): React.JSX.Element {
    const Heading = `h${level}` as const;
    return (
        <div className="nuiget-section-header" data-testid={`section-box-${testKey}`} data-variant={variant}>
            <Heading className="nuiget-section-heading">
                <button
                    type="button"
                    className="nuiget-section-toggle"
                    aria-expanded={expanded}
                    aria-controls={contentId}
                    title={tooltip}
                    data-testid={`section-header-${testKey}`}
                    onClick={onToggle}
                >
                    <ChevronRightIcon className="nuiget-section-chevron" />
                    <span className="nuiget-section-title" id={titleId}>{title}</span>
                    {/* The space is for the name: without it the toggle is called "Installed12". */}
                    {count === undefined ? null : <>{' '}<Badge label={String(count)} /></>}
                    {busy ? <Spinner /> : null}
                </button>
            </Heading>
            {actions ? <div className="nuiget-section-actions">{actions}</div> : null}
        </div>
    );
}
