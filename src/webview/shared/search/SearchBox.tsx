import { useEffect, useId, useState } from 'react';
import type React from 'react';
import { CloseIcon, FilterIcon, IconButton } from '../primitives';
import './search.css';

/** A package id the quick-search offers while the user types, with the source that knows it. */
export interface Suggestion {
    id: string;
    sourceName: string;
    /** The source's URL: where the versions of the suggestion are asked. */
    sourceUrl?: string;
}

/** The versions of the expanded suggestion, newest first, as the owner has them so far. */
export interface SuggestionVersions {
    suggestion: Suggestion;
    status: 'loading' | 'ready' | 'error';
    versions: readonly string[];
    message?: string;
}

export interface SearchBoxProps {
    value: string;
    onChange: (value: string) => void;
    /** Enter while no option of the dropdown is active. */
    onSubmit: (value: string) => void;
    /** The filter prefixes this surface offers (`@installed`, …); typing `@` lists those that match. */
    prefixes: readonly string[];
    /** Quick-search suggestions for the text; shown while the text is no prefix. */
    suggestions?: readonly Suggestion[];
    /** A suggestion was chosen (Enter or Tab on the active one, or a click). */
    onPickSuggestion?: (suggestion: Suggestion) => void;
    /** Suggestions are being asked: a loading row while there are none yet, and the list stays open meanwhile. */
    pending?: boolean;
    /** The versions level: shown instead of the suggestions while set. */
    versions?: SuggestionVersions;
    /** ArrowRight on a suggestion (or on the error row of its versions, to retry). */
    onExpandSuggestion?: (suggestion: Suggestion) => void;
    /** ArrowLeft, Escape or typing in the versions level. */
    onCollapseVersions?: () => void;
    /** Enter, Tab or a click on a version. */
    onPickVersion?: (suggestion: Suggestion, version: string) => void;
    /** Ctrl+Enter (Cmd+Enter) on a suggestion (its newest version) or on a version. */
    onQuickInstall?: (suggestion: Suggestion, version?: string) => void;
    label: string;
    placeholder: string;
    testId: string;
    className: string;
    inputRef?: React.Ref<HTMLInputElement>;
    /** The box gained or lost focus. */
    onFocusChange?: (focused: boolean) => void;
}

type Option =
    | { kind: 'prefix'; prefix: string }
    | { kind: 'suggestion'; suggestion: Suggestion }
    | { kind: 'version'; suggestion: Suggestion; version: string }
    /** A row that is no choice (loading, an error, nothing found): never active. */
    | { kind: 'note'; text: string };

const isCompletePrefix = (text: string, prefixes: readonly string[]): boolean => {
    const lower = text.toLowerCase();
    return prefixes.some(prefix => lower === prefix || lower.startsWith(`${prefix} `));
};

const VERSION_LIMIT = 5;

/** The suggestions by source, in the order the sources first appear. */
function groupsOf(suggestions: readonly Suggestion[]): Array<{ sourceName: string; suggestions: Suggestion[] }> {
    const groups = new Map<string, Suggestion[]>();
    for (const suggestion of suggestions) {
        groups.set(suggestion.sourceName, [...(groups.get(suggestion.sourceName) ?? []), suggestion]);
    }
    return [...groups].map(([sourceName, list]) => ({ sourceName, suggestions: list }));
}

/**
 * The search box of a surface as a combobox (interaction model §2): typing `@` opens the list of the prefixes that
 * match, and quick-search suggestions open the same list for plain text, grouped under their source's name when they
 * come from two or more sources, with a loading row while none has arrived. ArrowDown and ArrowUp move through the
 * options while focus stays in the box (`aria-activedescendant`), Enter or Tab takes the active option, and Escape
 * closes the list, then clears the box, then leaves it. Where the owner offers it, ArrowRight lists the versions of
 * the active suggestion (ArrowLeft goes back), and Ctrl+Enter (Cmd+Enter) asks to install the active suggestion or
 * version. The list belongs to the box and is no layer of its own: focus never moves into it, so it needs neither the
 * layer stack nor a listener on the document.
 */
export function SearchBox(props: SearchBoxProps): React.JSX.Element {
    const { value, onChange, onSubmit, prefixes, suggestions = [], onPickSuggestion, pending = false, versions, onExpandSuggestion, onCollapseVersions, onPickVersion, onQuickInstall, label, placeholder, testId, className, inputRef, onFocusChange } = props;
    const listId = `${useId()}-options`;
    const [active, setActive] = useState(-1);
    const [versionActive, setVersionActive] = useState(0);
    // Escape, Enter and a pick close the list for the text it was open for (and for the id picked, which the owner
    // may put in the box); typing opens it again.
    const [dismissedFor, setDismissedFor] = useState<readonly string[]>([]);

    // Entering the versions level makes its first version active.
    const expandedId = versions?.suggestion.id;
    useEffect(() => setVersionActive(0), [expandedId]);

    const text = value.trimStart();
    const prefixMode = text.startsWith('@');
    const groups = prefixMode ? [] : groupsOf(suggestions);
    const grouped = groups.length > 1;
    let options: Option[] = [];
    if (prefixMode) {
        if (!isCompletePrefix(text, prefixes)) {
            const lower = text.toLowerCase();
            options = prefixes.filter(prefix => prefix.startsWith(lower)).map(prefix => ({ kind: 'prefix', prefix }));
        }
    } else if (suggestions.length > 0) {
        options = groups.flatMap(group => group.suggestions.map((suggestion): Option => ({ kind: 'suggestion', suggestion })));
    } else if (pending) {
        options = [{ kind: 'note', text: 'Searching…' }];
    }
    const versionLevel = versions !== undefined && !prefixMode;
    let versionOptions: Option[] = [];
    if (versionLevel) {
        const listed = versions.versions.slice(0, VERSION_LIMIT);
        if (versions.status === 'loading') {
            versionOptions = [{ kind: 'note', text: 'Loading versions…' }];
        } else if (versions.status === 'error') {
            versionOptions = [{ kind: 'note', text: `${versions.message ?? 'The versions could not be listed'}. Press → to retry.` }];
        } else if (listed.length === 0) {
            versionOptions = [{ kind: 'note', text: 'No versions available' }];
        } else {
            versionOptions = listed.map((version): Option => ({ kind: 'version', suggestion: versions.suggestion, version }));
        }
    }
    const shownOptions = versionLevel ? versionOptions : options;
    const open = shownOptions.length > 0 && (versionLevel || !dismissedFor.includes(value));
    const activeIndex = open && !versionLevel && active < options.length && options[active]?.kind !== 'note' ? active : -1;
    const activeVersion = open && versionLevel && versionOptions[versionActive]?.kind === 'version' ? versionActive : -1;
    const activeOption = versionLevel ? (activeVersion >= 0 ? versionOptions[activeVersion] : undefined) : (activeIndex >= 0 ? options[activeIndex] : undefined);

    const collapse = (): void => {
        if (versions !== undefined) {
            onCollapseVersions?.();
        }
    };

    const change = (next: string): void => {
        collapse();
        setActive(-1);
        setDismissedFor([]);
        onChange(next);
    };

    const pick = (option: Option): void => {
        if (option.kind === 'prefix') {
            setActive(-1);
            change(`${option.prefix} `);
        } else if (option.kind === 'suggestion') {
            setActive(-1);
            setDismissedFor([value, option.suggestion.id]);
            onPickSuggestion?.(option.suggestion);
        } else if (option.kind === 'version') {
            setActive(-1);
            setDismissedFor([value, option.suggestion.id]);
            onPickVersion?.(option.suggestion, option.version);
        }
    };

    /** The next navigable index from `from` in `step` direction, wrapping; `-1` when there is none. */
    const step = (list: readonly Option[], from: number, direction: 1 | -1): number => {
        for (let count = 1; count <= list.length; count++) {
            const index = ((from + direction * count) % list.length + list.length) % list.length;
            if (list[index].kind !== 'note') {
                return index;
            }
        }
        return -1;
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowUp':
                if (open) {
                    event.preventDefault();
                    const direction = event.key === 'ArrowDown' ? 1 : -1;
                    if (versionLevel) {
                        const next = step(versionOptions, activeVersion < 0 ? (direction === 1 ? -1 : 0) : activeVersion, direction);
                        if (next >= 0) {
                            setVersionActive(next);
                        }
                    } else {
                        // Past either end the other end follows.
                        const next = step(options, activeIndex < 0 ? (direction === 1 ? -1 : 0) : activeIndex, direction);
                        setActive(next);
                    }
                }
                return;
            case 'ArrowRight':
                if (onExpandSuggestion !== undefined) {
                    if (!versionLevel && activeOption?.kind === 'suggestion') {
                        event.preventDefault();
                        onExpandSuggestion(activeOption.suggestion);
                    } else if (versionLevel && versions.status === 'error') {
                        event.preventDefault();
                        onExpandSuggestion(versions.suggestion);
                    }
                }
                return;
            case 'ArrowLeft':
                if (versionLevel) {
                    event.preventDefault();
                    onCollapseVersions?.();
                }
                return;
            case 'Enter':
                event.preventDefault();
                if ((event.ctrlKey || event.metaKey) && onQuickInstall !== undefined && (activeOption?.kind === 'suggestion' || activeOption?.kind === 'version')) {
                    onQuickInstall(activeOption.suggestion, activeOption.kind === 'version' ? activeOption.version : undefined);
                    return;
                }
                if (activeOption !== undefined) {
                    pick(activeOption);
                } else if (!versionLevel) {
                    setDismissedFor([value]);
                    onSubmit(value);
                }
                return;
            case 'Tab':
                if (activeOption !== undefined) {
                    event.preventDefault();
                    pick(activeOption);
                }
                return;
            case 'Escape':
                event.preventDefault();
                if (versionLevel) {
                    collapse();
                    setDismissedFor([value]);
                } else if (open) {
                    setActive(-1);
                    setDismissedFor([value]);
                } else if (value.length > 0) {
                    change('');
                } else {
                    event.currentTarget.blur();
                }
                return;
            default:
        }
    };

    const optionId = (index: number): string => `${listId}-${index}`;
    const versionId = (index: number): string => `${listId}-v${index}`;
    const descendant = versionLevel ? (activeVersion >= 0 ? versionId(activeVersion) : undefined) : (activeIndex >= 0 ? optionId(activeIndex) : undefined);
    // The box keeps focus: a press on the list must not blur it before the click lands.
    const keepFocus = (event: React.MouseEvent): void => event.preventDefault();

    const renderOption = (option: Option, id: string, isActive: boolean): React.JSX.Element => {
        if (option.kind === 'note') {
            return <div key={id} id={id} role="option" aria-selected={false} aria-disabled="true" className="nuiget-search-option nuiget-search-option--disabled">{option.text}</div>;
        }
        const name = option.kind === 'prefix' ? option.prefix : option.kind === 'suggestion' ? option.suggestion.id : option.version;
        const classes = ['nuiget-search-option', option.kind === 'version' ? 'nuiget-search-option--version' : '', isActive ? 'nuiget-search-option--active' : ''].filter(Boolean).join(' ');
        return (
            <div key={id} id={id} role="option" aria-selected={isActive} className={classes} onMouseDown={keepFocus} onClick={() => pick(option)}>
                <span>{name}</span>
                {option.kind === 'suggestion' && onExpandSuggestion !== undefined ? (
                    <span
                        className="nuiget-search-option-expand"
                        aria-hidden="true"
                        onClick={event => {
                            event.stopPropagation();
                            setActive(options.indexOf(option));
                            onExpandSuggestion(option.suggestion);
                        }}
                    >
                        ›
                    </span>
                ) : null}
            </div>
        );
    };

    let content: React.ReactNode;
    if (versionLevel) {
        content = versionOptions.map((option, index) => renderOption(option, versionId(index), index === activeVersion));
    } else if (grouped) {
        let index = 0;
        content = groups.map(group => {
            const headerId = `${listId}-group-${group.sourceName}`;
            return (
                <div key={group.sourceName} role="group" aria-labelledby={headerId}>
                    <div id={headerId} className="nuiget-search-group-header">{group.sourceName}</div>
                    {group.suggestions.map(() => {
                        const current = index++;
                        return renderOption(options[current], optionId(current), current === activeIndex);
                    })}
                </div>
            );
        });
    } else {
        content = options.map((option, index) => renderOption(option, option.kind === 'note' ? `${listId}-note` : optionId(index), index === activeIndex));
    }
    let listLabel = 'Suggestions';
    if (versionLevel) {
        listLabel = `Versions of ${versions.suggestion.id}`;
    } else if (options[0]?.kind === 'prefix') {
        listLabel = 'Filters';
    }

    return (
        <div className={value === '' ? 'nuiget-search-box' : 'nuiget-search-box nuiget-search-box--clearable'}>
            <input
                ref={inputRef}
                className={className}
                type="search"
                role="combobox"
                data-testid={testId}
                aria-label={label}
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-activedescendant={descendant}
                placeholder={placeholder}
                value={value}
                autoComplete="off"
                spellCheck={false}
                onChange={event => change(event.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => onFocusChange?.(true)}
                onBlur={() => {
                    collapse();
                    setDismissedFor([value]);
                    onFocusChange?.(false);
                }}
            />
            {/* Pointer helpers only: Escape clears and `@` lists the filters from the keyboard (§2). */}
            <span className="nuiget-search-actions">
                {value !== '' ? <IconButton label="Clear search" tabIndex={-1} onMouseDown={keepFocus} onClick={() => change('')}><CloseIcon /></IconButton> : null}
                <IconButton label="Filters" tabIndex={-1} onMouseDown={keepFocus} onClick={() => change(prefixMode ? '' : '@')}><FilterIcon /></IconButton>
            </span>
            {open ? (
                <div className="nuiget-search-popup">
                    {versionLevel ? (
                        <div className="nuiget-search-popup-header" aria-hidden="true" onMouseDown={keepFocus} onClick={() => onCollapseVersions?.()}>
                            {`‹ ${versions.suggestion.id}`}
                        </div>
                    ) : null}
                    <div className="nuiget-search-options" id={listId} role="listbox" aria-label={listLabel} aria-busy={pending && !versionLevel ? true : undefined} data-testid="search-suggestions">
                        {content}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
