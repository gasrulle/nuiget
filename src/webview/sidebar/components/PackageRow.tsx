import React, { useCallback } from 'react';

// ─── Inline SVG Codicons (16×16 viewBox, fill=currentColor) ─────────────────
const IconAdd = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z" />
    </svg>
);
const IconTrash = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M10 3h3v1h-1v9l-1 1H5l-1-1V4H3V3h3V2a1 1 0 011-1h2a1 1 0 011 1v1zM9 2H7v1h2V2zM5 4v9h6V4H5zm1 2h1v5H6V6zm3 0h1v5H9V6z" />
    </svg>
);
const IconArrowUp = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1L3 6h3v9h4V6h3L8 1z" />
    </svg>
);

interface PackageRowProps {
    packageId: string;
    version: string;
    description?: string;
    authors?: string;
    installedVersion?: string;
    latestVersion?: string;
    context: 'browse' | 'installed' | 'updates';
    selected?: boolean;
    onPrimaryAction: (packageId: string) => void;
    onContextMenu: (packageId: string, e: React.MouseEvent) => void;
    onClick?: (packageId: string) => void;
}

/**
 * Compact package row for the sidebar.
 * Shows package name, version, truncated description.
 * Hover reveals primary action button (SVG codicon). Right-click opens context menu.
 * Keyboard navigation is handled at the section container level.
 */
export const PackageRow: React.FC<PackageRowProps> = ({
    packageId,
    version,
    description,
    installedVersion,
    latestVersion,
    context,
    selected,
    onPrimaryAction,
    onContextMenu,
    onClick,
}) => {
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(packageId, e);
    }, [packageId, onContextMenu]);

    const handlePrimaryAction = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onPrimaryAction(packageId);
    }, [packageId, onPrimaryAction]);

    const handleClick = useCallback(() => {
        onClick?.(packageId);
    }, [packageId, onClick]);

    // Determine primary action label and icon
    let actionLabel: string;
    let ActionIcon: React.FC;
    if (context === 'browse') {
        if (installedVersion) {
            actionLabel = 'Uninstall (Del)';
            ActionIcon = IconTrash;
        } else {
            actionLabel = 'Install (Enter)';
            ActionIcon = IconAdd;
        }
    } else if (context === 'installed') {
        actionLabel = 'Uninstall (Del)';
        ActionIcon = IconTrash;
    } else {
        actionLabel = 'Update (Enter)';
        ActionIcon = IconArrowUp;
    }

    const displayVersion = context === 'updates'
        ? `${installedVersion} → ${latestVersion}`
        : context === 'installed'
            ? (installedVersion || version)
            : version;

    const className = `package-row${selected ? ' selected' : ''}`;

    return (
        <div
            className={className}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            role="option"
            aria-selected={!!selected}
            aria-label={`${packageId} ${displayVersion}`}
            data-package-id={packageId}
        >
            <div className="package-row-main">
                <div className="package-row-header" title={`${packageId} ${displayVersion}`}>
                    <span className="package-row-name">{packageId}</span>
                    <span className="package-row-version">{displayVersion}</span>
                </div>
                {description && (
                    <div className="package-row-description" title={description}>
                        {description}
                    </div>
                )}
            </div>
            <button
                className="package-row-action"
                onClick={handlePrimaryAction}
                title={actionLabel}
                aria-label={`${actionLabel} ${packageId}`}
                tabIndex={-1}
            >
                <ActionIcon />
            </button>
        </div>
    );
};
