import React, { useCallback } from 'react';

// ─── Inline SVG Codicons (16×16 viewBox, fill=currentColor) ─────────────────
const IconAdd = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z" />
    </svg>
);
const IconClose = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z" />
    </svg>
);
const IconArrowUp = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M8 1L3 6h3v9h1V6h4L8 1zm3.5 5L8 2.207 4.5 6H8h3.5z" />
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
            ActionIcon = IconClose;
        } else {
            actionLabel = 'Install (Enter)';
            ActionIcon = IconAdd;
        }
    } else if (context === 'installed') {
        actionLabel = 'Uninstall (Del)';
        ActionIcon = IconClose;
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
                <div className="package-row-header">
                    <span className="package-row-name" title={packageId}>{packageId}</span>
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
