import React, { useId } from 'react';
import { Badge, type BadgeTone } from './Badge';
import './primitives.css';

export interface TabItem<K extends string> {
    id: K;
    label: string;
    /** A count next to the label, for example the number of updates. It is part of the tab's name. */
    count?: number;
    /** A second badge after the count, named by its `title` (for example the vulnerable packages of the list). */
    badge?: { label: string; title: string; tone?: BadgeTone };
    'data-testid'?: string;
}

export interface TabsProps<K extends string> {
    tabs: ReadonlyArray<TabItem<K>>;
    selected: K;
    onSelect: (id: K) => void;
    /** The name of the tab list, for example "Package lists". */
    label: string;
    /** The content of the selected tab. */
    children: React.ReactNode;
    /** On the tab list. */
    'data-testid'?: string;
}

/**
 * Tabs (`tablist`, `tab`, `tabpanel`) with one tab stop: the selected tab. ArrowLeft and ArrowRight move to the
 * previous and next tab and wrap around, Home and End go to the first and last; moving selects, because a panel
 * shows without delay. Only the selected panel is rendered; the selected tab controls it and its label and count name it.
 */
export function Tabs<K extends string>({ tabs, selected, onSelect, label, children, 'data-testid': testId }: TabsProps<K>): React.JSX.Element {
    const baseId = useId();
    const tabId = (id: K): string => `${baseId}-tab-${id}`;
    const panelId = `${baseId}-panel`;

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        const index = tabs.findIndex(tab => tab.id === selected);
        const last = tabs.length - 1;
        const next = { ArrowRight: index >= last ? 0 : index + 1, ArrowLeft: index <= 0 ? last : index - 1, Home: 0, End: last }[event.key];
        if (next === undefined || tabs.length === 0) {
            return;
        }
        event.preventDefault();
        const target = tabs[next];
        onSelect(target.id);
        document.getElementById(tabId(target.id))?.focus();
    };

    // The panel is named by the label and count, without the badge's tooltip.
    const nameOf = (tab: TabItem<K>): string => (tab.count === undefined ? `${tabId(tab.id)}-label` : `${tabId(tab.id)}-label ${tabId(tab.id)}-count`);
    const selectedTab = tabs.find(tab => tab.id === selected);

    return (
        <div className="nuiget-tabs">
            <div className="nuiget-tablist" role="tablist" aria-label={label} data-testid={testId} onKeyDown={onKeyDown}>
                {tabs.map(tab => {
                    const isSelected = tab.id === selected;
                    return (
                        <button
                            key={tab.id}
                            id={tabId(tab.id)}
                            type="button"
                            role="tab"
                            className="nuiget-tab"
                            aria-selected={isSelected}
                            aria-controls={isSelected ? panelId : undefined}
                            tabIndex={isSelected ? 0 : -1}
                            data-testid={tab['data-testid']}
                            onClick={() => onSelect(tab.id)}
                        >
                            <span id={`${tabId(tab.id)}-label`} className="nuiget-tab-label">{tab.label}</span>
                            {/* A flex item of white space is not drawn; the tab is named by its content, whose visible text the name must hold (WCAG 2.5.3). */}
                            {tab.count === undefined ? null : <>{' '}<span id={`${tabId(tab.id)}-count`} className="nuiget-tab-count"><Badge label={String(tab.count)} /></span></>}
                            {tab.badge === undefined ? null : <>{' '}<span id={`${tabId(tab.id)}-badge`} className="nuiget-tab-badge"><Badge label={tab.badge.label} title={tab.badge.title} tone={tab.badge.tone} /></span></>}
                        </button>
                    );
                })}
            </div>
            <div className="nuiget-tabpanel" id={panelId} role="tabpanel" aria-labelledby={selectedTab === undefined ? tabId(selected) : nameOf(selectedTab)}>
                {children}
            </div>
        </div>
    );
}
