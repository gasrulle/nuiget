import React from 'react';

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
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M5.7 13.7L5 13l4.6-4.6L5 3.7l.7-.7 5.3 5.3-5.3 5.4z" />
                </svg>
            </span>
            <span className="section-title">{title}</span>
            {loading && <span className="section-spinner" />}
            {actions && (
                <span className="section-actions" onClick={(e) => e.stopPropagation()}>
                    {actions}
                </span>
            )}
            {!loading && count !== undefined && count > 0 && (
                <span className="section-badge">{count}</span>
            )}
        </div>
    );
};
