import type React from 'react';
import './primitives.css';

export interface GroupCaptionProps {
    /** The caption's text, Title Case (T-20). */
    title: string;
    /** 3 for a section of the details pane (Vulnerabilities, Dependencies, Required by), 4 for a block inside one. */
    level?: 3 | 4;
    /** The heading's id, for the `aria-labelledby` of the list it labels. */
    id?: string;
    /** When given, the heading carries `data-testid="section-box-<testKey>"` and `data-variant="level"`: the Required by block hook of interaction-model §8 that the measurements read. */
    testKey?: string;
}

/**
 * The caption of a group that does not collapse: a heading at the body size and the semibold weight, in normal case
 * (T-13, DS-TYPE-9). It sets no spacing: the space around it belongs to its container.
 */
export function GroupCaption({ title, level = 3, id, testKey }: GroupCaptionProps): React.JSX.Element {
    const Heading = `h${level}` as const;
    return (
        <Heading
            className="nuiget-group-caption"
            id={id}
            data-testid={testKey === undefined ? undefined : `section-box-${testKey}`}
            data-variant={testKey === undefined ? undefined : 'level'}
        >
            {title}
        </Heading>
    );
}
