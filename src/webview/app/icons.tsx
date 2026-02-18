/**
 * Inline SVG icon components matching VS Code's codicon system.
 * Codicon fonts are NOT available in webviews — inline SVGs are required.
 * All icons use `currentColor` to inherit from CSS (theme-aware by default).
 *
 * SVG paths sourced from VS Code codicon set (MIT license).
 * @see https://github.com/microsoft/vscode-codicons
 */
import React from 'react';

interface IconProps {
    size?: number;
    className?: string;
    title?: string;
    style?: React.CSSProperties;
}

const defaultSize = 16;

/** Codicon: chevron-right */
export const ChevronRightIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path d="M5.7 13.7L5 13l4.6-4.6L5 3.7l.7-.7 5.3 5.3-5.3 5.4z" />
    </svg>
);

/** Codicon: chevron-down */
export const ChevronDownIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path d="M7.976 10.072l4.357-4.357.62.618L7.977 11.3 3 6.333l.619-.618 4.357 4.357z" />
    </svg>
);

/** Codicon: settings-gear */
export const SettingsGearIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" clipRule="evenodd" d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.4.5v1.2l2.4.5.3.8-1.3 2 .8.8 2-1.3.8.3.4 2.3h1.2l.5-2.4.8-.3 2 1.3.8-.8-1.3-2 .3-.8 2.3-.4V7.1l-2.4-.5-.3-.7 1.3-2-.8-.9-2 1.3-.7-.2zM9.4 1l.5 2.4L12 2.1l2 2-1.4 2.1 2.4.4v2.8l-2.4.5L14 12l-2 2-2.1-1.4-.5 2.4H6.6l-.5-2.4L4 14l-2-2 1.4-2.1L1 9.4V6.6l2.4-.5L2 4l2-2 2.1 1.4.4-2.4h2.8zm.6 7a2 2 0 11-4 0 2 2 0 014 0zm1 0a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

/** Codicon: warning */
export const WarningIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" clipRule="evenodd" d="M7.56 1h.88l6.54 12.26-.44.74H1.44l-.42-.74L7.56 1zm.44 1.56L2.2 13H13.8L8 2.56zM8 11a1 1 0 110 2 1 1 0 010-2zm-.5-5h1v4h-1V6z" />
    </svg>
);

/** Codicon: close (x) */
export const CloseIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" clipRule="evenodd" d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z" />
    </svg>
);

/** Codicon: check — used by VerifiedIcon, available for general use */
export const CheckIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" clipRule="evenodd" d="M14.431 3.323l-8.47 10-.79-.036-3.35-4.77.818-.574 2.978 4.24 8.051-9.506.763.646z" />
    </svg>
);

/** Codicon: arrow-right */
export const ArrowRightIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" clipRule="evenodd" d="M9 13.887l5-5.5-5-5.5-.74.672L12.014 8H1v.75h11.014L8.26 13.215 9 13.887z" />
    </svg>
);

/** Codicon: arrow-left */
export const ArrowLeftIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" clipRule="evenodd" d="M7 3.093L2 8.593l5 5.5.74-.672L3.986 9H15v-.75H3.986L7.74 3.765 7 3.093z" />
    </svg>
);

/** Codicon: cloud-download */
export const CloudDownloadIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" clipRule="evenodd" d="M11.957 6h.088a2.96 2.96 0 012.955 2.955 2.96 2.96 0 01-2.955 2.955h-1.6l-.2-.8h1.8a2.158 2.158 0 002.155-2.155A2.158 2.158 0 0012.045 6.8h-.7l-.1-.7A3.503 3.503 0 007.8 3.2a3.502 3.502 0 00-3.4 2.9l-.1.7h-.7A2.158 2.158 0 001.445 8.955 2.158 2.158 0 003.6 11.11h1.6l-.2.8H3.6A2.96 2.96 0 01.645 8.955 2.96 2.96 0 013.6 6h.088A4.3 4.3 0 017.8 2.4 4.3 4.3 0 0111.957 6zM7.8 7.6L5.2 10.8H7v3.2h1.6v-3.2h1.8L7.8 7.6z" />
    </svg>
);

/** Codicon: info */
export const InfoIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" clipRule="evenodd" d="M8.568 1.031A6.8 6.8 0 0112.76 3.05a7.06 7.06 0 01.46 9.39 6.85 6.85 0 01-8.58 1.74 7 7 0 01-3.12-3.5 7.12 7.12 0 01-.23-4.71 7 7 0 012.77-3.79 6.8 6.8 0 014.508-1.149zM8 14.88a6.06 6.06 0 003.75-1.3 6.27 6.27 0 002.09-3.18 6.3 6.3 0 00-.4-4.17 6.15 6.15 0 00-2.78-2.97A5.89 5.89 0 005.72 3.1a6.19 6.19 0 00-2.45 3.36 6.31 6.31 0 00.21 4.18A6.12 6.12 0 006.1 14.1 5.94 5.94 0 008 14.88zM9 4H7v2h2V4zm0 3H7v6h2V7z" />
    </svg>
);

/** Codicon: sync (rotating refresh) */
export const SyncIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" clipRule="evenodd" d="M2.006 8.267L.78 9.5 0 8.73l2.09-2.07.76.01 2.09 2.12-.76.69-1.167-1.18a5 5 0 009.4 1.96l.72.37a5.74 5.74 0 01-2.3 2.63 5.68 5.68 0 01-3.32 1.03 5.74 5.74 0 01-5.506-4.386zM13.994 7.733L15.22 6.5l.78.77-2.09 2.07-.76-.01-2.09-2.12.76-.69 1.167 1.18a5 5 0 00-9.4-1.96l-.72-.37a5.74 5.74 0 012.3-2.63 5.68 5.68 0 013.32-1.03 5.74 5.74 0 015.506 4.386z" />
    </svg>
);

/** Codicon: symbol-ruler (range) */
export const RulerIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path d="M14 2H6l-4 4 4 4h8l2-4-2-4zM6.5 3h1v2h-1V3zm2 0h1v3h-1V3zm2 0h1v2h-1V3zm-4 7H5.414L2.207 6.793 5.414 3.586V5.5h1V3h1v3h1V3h1v2.5h1V3h1.586L14.793 6 11.586 10H6.5z" />
    </svg>
);

/** Codicon: loading~spin (hourglass/spinner) */
export const LoadingIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={`codicon-loading ${className || ''}`} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path d="M13.917 7A6.002 6.002 0 002.083 7H1.071a7.002 7.002 0 0113.858 0h-1.012z" />
    </svg>
);

/** Codicon: clear-all — standard VS Code clear icon for search inputs */
export const ClearAllIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path d="M13.5004 12.0004C13.7762 12.0006 14.0004 12.2245 14.0004 12.5004C14.0002 12.7761 13.7761 13.0002 13.5004 13.0004H2.50037C2.22449 13.0004 2.00056 12.7762 2.00037 12.5004C2.00037 12.2244 2.22437 12.0004 2.50037 12.0004H13.5004Z" />
        <path d="M13.5004 9.00037C13.7762 9.00056 14.0004 9.22449 14.0004 9.50037C14.0002 9.77608 13.7761 10.0002 13.5004 10.0004H2.50037C2.22449 10.0004 2.00056 9.7762 2.00037 9.50037C2.00037 9.22437 2.22437 9.00037 2.50037 9.00037H13.5004Z" />
        <path d="M13.5004 6.00037C13.7762 6.00056 14.0004 6.22449 14.0004 6.50037C14.0002 6.77608 13.7761 7.00017 13.5004 7.00037H7.50037C7.22449 7.00037 7.00056 6.7762 7.00037 6.50037C7.00037 6.22437 7.22437 6.00037 7.50037 6.00037H13.5004Z" />
        <path d="M5.50037 0.999023C5.63295 0.999115 5.76009 1.05179 5.85388 1.14551C5.94777 1.23939 6.00037 1.36722 6.00037 1.5C6.00027 1.63265 5.94769 1.75971 5.85388 1.85352L3.7074 4L5.85388 6.14551C5.94777 6.23939 6.00037 6.36722 6.00037 6.5C6.00027 6.63265 5.94769 6.75971 5.85388 6.85352C5.76008 6.94732 5.63302 6.99991 5.50037 7C5.36759 7 5.23976 6.9474 5.14587 6.85352L3.00037 4.70703L0.853882 6.85352C0.760077 6.94732 0.633017 6.99991 0.500366 7C0.36759 7 0.239761 6.9474 0.145874 6.85352C0.0521583 6.75972 -0.000519052 6.63258 -0.000610352 6.5C-0.000610354 6.36722 0.0519875 6.23939 0.145874 6.14551L2.29333 4L0.145874 1.85352C0.0521583 1.75972 -0.000519119 1.63258 -0.000610352 1.5C-0.000610351 1.36722 0.0519874 1.23939 0.145874 1.14551C0.239761 1.05162 0.36759 0.999023 0.500366 0.999023C0.63295 0.999115 0.76009 1.05179 0.853882 1.14551L3.00037 3.29297L5.14587 1.14551C5.23976 1.05162 5.36759 0.999023 5.50037 0.999023Z" />
        <path d="M13.5004 3.00037C13.7762 3.00056 14.0004 3.22449 14.0004 3.50037C14.0002 3.77608 13.7761 4.00017 13.5004 4.00037H7.50037C7.22449 4.00037 7.00056 3.7762 7.00037 3.50037C7.00037 3.22437 7.22437 3.00037 7.50037 3.00037H13.5004Z" />
    </svg>
);

/** Codicon: trash */
export const TrashIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" clipRule="evenodd" d="M10 3h3v1h-1v9l-1 1H5l-1-1V4H3V3h3V2a1 1 0 011-1h2a1 1 0 011 1v1zM9 2H7v1h2V2zM5 4v9h6V4H5zm1 2h1v5H6V6zm3 0h1v5H9V6z" />
    </svg>
);

/** NuGet verified prefix badge — uses check mark (matches nuget.org visual) */
export const VerifiedIcon: React.FC<IconProps> = ({ size = 14, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" clipRule="evenodd" d="M14.431 3.323l-8.47 10-.79-.036-3.35-4.77.818-.574 2.978 4.24 8.051-9.506.763.646z" />
    </svg>
);

/** Codicon: link-external */
export const ExternalLinkIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path d="M1.5 1H6v1H2v12h12v-4h1v4.5l-.5.5h-13l-.5-.5v-13l.5-.5z" />
        <path d="M15 1.5V8h-1V2.707L7.243 9.465l-.707-.708L13.293 2H8V1h6.5l.5.5z" />
    </svg>
);

/** Codicon: add (plus) */
export const PlusIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z" />
    </svg>
);

/** Codicon: arrow-up — used for package update action */
export const ArrowUpIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path d="M8 1L3 6h3v9h4V6h3L8 1z" />
    </svg>
);

/** Custom: single project icon (multi-window outline) */
export const SingleProjectIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path d="M13.5 1H8.5C8.10218 1 7.72064 1.15804 7.43934 1.43934C7.15804 1.72064 7 2.10218 7 2.5V3H2.5C2.10218 3 1.72064 3.15804 1.43934 3.43934C1.15804 3.72064 1 4.10218 1 4.5V11.5C1 11.8978 1.15804 12.2794 1.43934 12.5607C1.72064 12.842 2.10218 13 2.5 13H4V13.5C4 13.8978 4.15804 14.2794 4.43934 14.5607C4.72064 14.842 5.10218 15 5.5 15H10.5C10.8978 15 11.2794 14.842 11.5607 14.5607C11.842 14.2794 12 13.8978 12 13.5V11H13.5C13.8978 11 14.2794 10.842 14.5607 10.5607C14.842 10.2794 15 9.89782 15 9.5V2.5C15 2.10218 14.842 1.72064 14.5607 1.43934C14.2794 1.15804 13.8978 1 13.5 1ZM2.5 12C2.36739 12 2.24021 11.9473 2.14645 11.8536C2.05268 11.7598 2 11.6326 2 11.5V4.5C2 4.36739 2.05268 4.24021 2.14645 4.14645C2.24021 4.05268 2.36739 4 2.5 4H7V5H5.5C5.10218 5 4.72064 5.15804 4.43934 5.43934C4.15804 5.72064 4 6.10218 4 6.5V12H2.5ZM11 13.5C11 13.6326 10.9473 13.7598 10.8536 13.8536C10.7598 13.9473 10.6326 14 10.5 14H5.5C5.36739 14 5.24021 13.9473 5.14645 13.8536C5.05268 13.7598 5 13.6326 5 13.5V6.5C5 6.36739 5.05268 6.24021 5.14645 6.14645C5.24021 6.05268 5.36739 6 5.5 6H10.5C10.6326 6 10.7598 6.05268 10.8536 6.14645C10.9473 6.24021 11 6.36739 11 6.5V13.5ZM14 9.5C14 9.63261 13.9473 9.75979 13.8536 9.85355C13.7598 9.94732 13.6326 10 13.5 10H12V6.5C12 6.10218 11.842 5.72064 11.5607 5.43934C11.2794 5.15804 10.8978 5 10.5 5H8V2.5C8 2.36739 8.05268 2.24021 8.14645 2.14645C8.24021 2.05268 8.36739 2 8.5 2H13.5C13.6326 2 13.7598 2.05268 13.8536 2.14645C13.9473 2.24021 14 2.36739 14 2.5V9.5Z" />
    </svg>
);

/** Custom: all projects icon (multi-window outline with stacked ghost background) */
export const AllProjectsIcon: React.FC<IconProps> = ({ size = defaultSize, className, title, style }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style} aria-hidden={!title} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <g opacity="0.55">
            <rect x="2" y="4" width="5" height="8" rx="0.5" />
            <rect x="5" y="6" width="6" height="8" rx="0.5" />
            <rect x="8" y="2" width="6" height="8" rx="0.5" />
        </g>
        <path d="M13.5 1H8.5C8.10218 1 7.72064 1.15804 7.43934 1.43934C7.15804 1.72064 7 2.10218 7 2.5V3H2.5C2.10218 3 1.72064 3.15804 1.43934 3.43934C1.15804 3.72064 1 4.10218 1 4.5V11.5C1 11.8978 1.15804 12.2794 1.43934 12.5607C1.72064 12.842 2.10218 13 2.5 13H4V13.5C4 13.8978 4.15804 14.2794 4.43934 14.5607C4.72064 14.842 5.10218 15 5.5 15H10.5C10.8978 15 11.2794 14.842 11.5607 14.5607C11.842 14.2794 12 13.8978 12 13.5V11H13.5C13.8978 11 14.2794 10.842 14.5607 10.5607C14.842 10.2794 15 9.89782 15 9.5V2.5C15 2.10218 14.842 1.72064 14.5607 1.43934C14.2794 1.15804 13.8978 1 13.5 1ZM2.5 12C2.36739 12 2.24021 11.9473 2.14645 11.8536C2.05268 11.7598 2 11.6326 2 11.5V4.5C2 4.36739 2.05268 4.24021 2.14645 4.14645C2.24021 4.05268 2.36739 4 2.5 4H7V5H5.5C5.10218 5 4.72064 5.15804 4.43934 5.43934C4.15804 5.72064 4 6.10218 4 6.5V12H2.5ZM11 13.5C11 13.6326 10.9473 13.7598 10.8536 13.8536C10.7598 13.9473 10.6326 14 10.5 14H5.5C5.36739 14 5.24021 13.9473 5.14645 13.8536C5.05268 13.7598 5 13.6326 5 13.5V6.5C5 6.36739 5.05268 6.24021 5.14645 6.14645C5.24021 6.05268 5.36739 6 5.5 6H10.5C10.6326 6 10.7598 6.05268 10.8536 6.14645C10.9473 6.24021 11 6.36739 11 6.5V13.5ZM14 9.5C14 9.63261 13.9473 9.75979 13.8536 9.85355C13.7598 9.94732 13.6326 10 13.5 10H12V6.5C12 6.10218 11.842 5.72064 11.5607 5.43934C11.2794 5.15804 10.8978 5 10.5 5H8V2.5C8 2.36739 8.05268 2.24021 8.14645 2.14645C8.24021 2.05268 8.36739 2 8.5 2H13.5C13.6326 2 13.7598 2.05268 13.8536 2.14645C13.9473 2.24021 14 2.36739 14 2.5V9.5Z" />
    </svg>
);
