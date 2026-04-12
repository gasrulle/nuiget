import React, { useCallback } from 'react';
import { ArrowRightIcon, ArrowUpIcon, PlusIcon, TrashIcon } from '../../app/icons';

interface PackageRowProps {
    packageId: string;
    version: string;
    description?: string;
    authors?: string;
    installedVersion?: string;
    latestVersion?: string;
    /** Override the default action button tooltip (e.g., to list projects) */
    actionTooltip?: string;
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
    actionTooltip,
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
    let ActionIcon: React.FC<{ size?: number }>;
    if (context === 'browse') {
        if (installedVersion) {
            actionLabel = 'Uninstall (Del)';
            ActionIcon = TrashIcon;
        } else {
            actionLabel = 'Install (Enter)';
            ActionIcon = PlusIcon;
        }
    } else if (context === 'installed') {
        actionLabel = 'Uninstall (Del)';
        ActionIcon = TrashIcon;
    } else {
        actionLabel = 'Update (Enter)';
        ActionIcon = ArrowUpIcon;
    }

    const displayVersion = context === 'updates'
        ? `${installedVersion} \u2192 ${latestVersion}`
        : context === 'installed'
            ? (installedVersion || version)
            : version;

    const versionContent = context === 'updates'
        ? <>{installedVersion} <ArrowRightIcon size={10} /> {latestVersion}</>
        : displayVersion;

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
            data-testid={`package-row-${packageId}`}
        >
            <div className="package-row-main">
                <div className="package-row-header" title={`${packageId} ${displayVersion}`}>
                    <span className="package-row-name">{packageId}</span>
                    <span className="package-row-version">{versionContent}</span>
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
                title={actionTooltip || actionLabel}
                aria-label={`${actionLabel} ${packageId}`}
                tabIndex={-1}
            >
                <ActionIcon size={14} />
            </button>
        </div>
    );
};
