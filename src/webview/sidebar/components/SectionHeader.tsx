import React from 'react';
import { ChevronRightIcon } from '../../app/icons';

interface SectionHeaderProps {
    title: string;
    expanded: boolean;
    count?: number;
    loading?: boolean;
    onToggle: () => void;
    actions?: React.ReactNode;
}

/**
 * Collapsible section header styled to match VS Code tree view headers.
 * Renders a chevron, title, optional count badge, and optional action buttons.
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
    title,
    expanded,
    count,
    loading,
    onToggle,
    actions
}) => {
    return (
        <div
            className={`section-header ${expanded ? 'expanded' : ''}`}
            onClick={onToggle}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggle();
                }
            }}
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
        >
            <span className={`section-chevron${expanded ? ' expanded' : ''}`}>
                <ChevronRightIcon size={16} />
            </span>
            <span className="section-title">{title}</span>
            {actions && (
                <span className="section-actions" onClick={(e) => e.stopPropagation()}>
                    {actions}
                </span>
            )}
            {loading && <span className="section-spinner" />}
            {!loading && count !== undefined && count > 0 && (
                <span className="section-badge">{count}</span>
            )}
        </div>
    );
};
