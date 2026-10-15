import { useId, useState } from 'react';
import type React from 'react';
import './search.css';

/** A package id the quick-search offers while the user types, with the source that knows it. */
export interface Suggestion {
    id: string;
    sourceName: string;
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
    label: string;
    placeholder: string;
    testId: string;
    className: string;
    inputRef?: React.Ref<HTMLInputElement>;
    /** The box gained or lost focus. */
    onFocusChange?: (focused: boolean) => void;
}

type Option = { kind: 'prefix'; prefix: string } | { kind: 'suggestion'; suggestion: Suggestion };

const isCompletePrefix = (text: string, prefixes: readonly string[]): boolean => {
    const lower = text.toLowerCase();
    return prefixes.some(prefix => lower === prefix || lower.startsWith(`${prefix} `));
};

/**
 * The search box of a surface as a combobox (interaction model §2): typing `@` opens the list of the prefixes that
 * match, and quick-search suggestions open the same list for plain text. ArrowDown and ArrowUp move through the
 * options while focus stays in the box (`aria-activedescendant`), Enter or Tab takes the active option, and Escape
 * closes the list, then clears the box, then leaves it. The list belongs to the box and is no layer of its own:
 * focus never moves into it, so it needs neither the layer stack nor a listener on the document.
 */
export function SearchBox(props: SearchBoxProps): React.JSX.Element {
    const { value, onChange, onSubmit, prefixes, suggestions = [], onPickSuggestion, label, placeholder, testId, className, inputRef, onFocusChange } = props;
    const listId = `${useId()}-options`;
    const [active, setActive] = useState(-1);
    // Escape, Enter and a pick close the list for the text it was open for (and for the id picked, which the owner
    // may put in the box); typing opens it again.
    const [dismissedFor, setDismissedFor] = useState<readonly string[]>([]);

    const text = value.trimStart();
    let options: Option[] = [];
    if (text.startsWith('@')) {
        if (!isCompletePrefix(text, prefixes)) {
            const lower = text.toLowerCase();
            options = prefixes.filter(prefix => prefix.startsWith(lower)).map(prefix => ({ kind: 'prefix', prefix }));
        }
    } else {
        options = suggestions.map(suggestion => ({ kind: 'suggestion', suggestion }));
    }
    const open = options.length > 0 && !dismissedFor.includes(value);
    const activeIndex = open && active < options.length ? active : -1;
    const showSources = new Set(suggestions.map(suggestion => suggestion.sourceName)).size > 1;

    const change = (next: string): void => {
        setActive(-1);
        setDismissedFor([]);
        onChange(next);
    };

    const pick = (option: Option): void => {
        setActive(-1);
        if (option.kind === 'prefix') {
            change(`${option.prefix} `);
        } else {
            setDismissedFor([value, option.suggestion.id]);
            onPickSuggestion?.(option.suggestion);
        }
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowUp':
                if (open) {
                    event.preventDefault();
                    // Past either end the other end follows.
                    const next = activeIndex + (event.key === 'ArrowDown' ? 1 : -1);
                    setActive(next < 0 ? options.length - 1 : next % options.length);
                }
                return;
            case 'Enter':
                event.preventDefault();
                if (activeIndex >= 0) {
                    pick(options[activeIndex]);
                } else {
                    setDismissedFor([value]);
                    onSubmit(value);
                }
                return;
            case 'Tab':
                if (activeIndex >= 0) {
                    event.preventDefault();
                    pick(options[activeIndex]);
                }
                return;
            case 'Escape':
                event.preventDefault();
                if (open) {
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
    return (
        <div className="nuiget-search-box">
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
                aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
                placeholder={placeholder}
                value={value}
                autoComplete="off"
                spellCheck={false}
                onChange={event => change(event.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => onFocusChange?.(true)}
                onBlur={() => {
                    setDismissedFor([value]);
                    onFocusChange?.(false);
                }}
            />
            {open ? (
                <ul className="nuiget-search-options" id={listId} role="listbox" aria-label={options[0].kind === 'prefix' ? 'Filters' : 'Suggestions'} data-testid="search-suggestions">
                    {options.map((option, index) => (
                        <li
                            key={option.kind === 'prefix' ? option.prefix : `${option.suggestion.sourceName}/${option.suggestion.id}`}
                            id={optionId(index)}
                            role="option"
                            aria-selected={index === activeIndex}
                            className={`nuiget-search-option${index === activeIndex ? ' nuiget-search-option--active' : ''}`}
                            // The box keeps focus: a press on an option must not blur it before the click lands.
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => pick(option)}
                        >
                            {option.kind === 'prefix' ? option.prefix : option.suggestion.id}
                            {option.kind === 'suggestion' && showSources ? <span className="nuiget-search-option-source">{option.suggestion.sourceName}</span> : null}
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
