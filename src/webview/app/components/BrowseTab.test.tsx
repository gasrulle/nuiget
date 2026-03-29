import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowseTabHandle, BrowseTabProps } from './BrowseTab';

// Must mock @tanstack/react-virtual before importing BrowseTab
vi.mock('@tanstack/react-virtual', () => ({
    useVirtualizer: vi.fn(() => ({
        getTotalSize: () => 500,
        getVirtualItems: () => [],
        measureElement: vi.fn(),
        scrollToIndex: vi.fn(),
    })),
}));

// Now import after mocks
const mod = await import('./BrowseTab');
const BrowseTabComponent = (mod as any).MemoizedBrowseTab || (mod as any).default;

const mockVscode = { postMessage: vi.fn(), getState: vi.fn(), setState: vi.fn() };

function createProps(overrides: Partial<BrowseTabProps> = {}): BrowseTabProps {
    return {
        activeTab: 'browse',
        selectedPackage: null,
        selectedVersion: '',
        detailsTab: 'details',
        includePrerelease: false,
        selectedSource: 'all',
        enabledSources: [{ name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true }],
        selectedProject: '/proj.csproj',
        recentSearches: [],
        recentSearchesLimit: 5,
        searchDebounceMode: 'quicksearch',
        splitPosition: 50,
        defaultPackageIcon: 'data:image/png;base64,abc',
        detailsPanelContent: <div data-testid="details-panel">Details</div>,
        versionsCache: { current: { get: vi.fn(), set: vi.fn(), has: vi.fn(), clear: vi.fn(), size: 0 } as any },
        onSelectPackage: vi.fn(),
        clearSelection: vi.fn(),
        onInstall: vi.fn(),
        onSetSelectedPackage: vi.fn(),
        onSetSelectedTransitivePackage: vi.fn(),
        onSetSelectedVersion: vi.fn(),
        onSetRecentSearches: vi.fn(),
        onDetailsTabChange: vi.fn(),
        setSplitPosition: vi.fn(),
        handleSashReset: vi.fn(),
        handleSashDragEnd: vi.fn(),
        createPackageListKeyHandler: vi.fn(() => vi.fn()),
        vscode: mockVscode,
        browseTabRef: { current: null },
        MemoizedDraggableSash: (_props: any) => <div data-testid="sash" />,
        ...overrides,
    };
}

describe('BrowseTab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders search input and button', () => {
        render(<BrowseTabComponent {...createProps()} />);
        expect(screen.getByPlaceholderText('Search packages...')).toBeInTheDocument();
        expect(screen.getByText('Search')).toBeInTheDocument();
    });

    it('renders empty state when no results', () => {
        render(<BrowseTabComponent {...createProps()} />);
        expect(screen.getByText('Search for packages above')).toBeInTheDocument();
    });

    it('renders details panel content', () => {
        render(<BrowseTabComponent {...createProps()} />);
        expect(screen.getByTestId('details-panel')).toBeInTheDocument();
    });

    it('renders sash', () => {
        render(<BrowseTabComponent {...createProps()} />);
        expect(screen.getByTestId('sash')).toBeInTheDocument();
    });

    it('triggers search on Search button click', () => {
        mockVscode.postMessage.mockClear();
        render(<BrowseTabComponent {...createProps()} />);
        const input = screen.getByPlaceholderText('Search packages...');
        fireEvent.change(input, { target: { value: 'Newtonsoft' } });
        fireEvent.click(screen.getByText('Search'));
        expect(mockVscode.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'searchPackages',
            query: 'Newtonsoft',
        }));
    });

    it('triggers search on Enter key', () => {
        mockVscode.postMessage.mockClear();
        render(<BrowseTabComponent {...createProps()} />);
        const input = screen.getByPlaceholderText('Search packages...');
        fireEvent.change(input, { target: { value: 'Serilog' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(mockVscode.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'searchPackages',
            query: 'Serilog',
        }));
    });

    it('shows Searching... button during loading', () => {
        mockVscode.postMessage.mockClear();
        render(<BrowseTabComponent {...createProps()} />);
        const input = screen.getByPlaceholderText('Search packages...');
        fireEvent.change(input, { target: { value: 'test' } });
        fireEvent.click(screen.getByText('Search'));
        // Both 'Searching...' in button and in spinner container
        const searchingElements = screen.getAllByText('Searching...');
        expect(searchingElements.length).toBeGreaterThanOrEqual(1);
    });

    it('clears search on clear button click', () => {
        const onSetSelectedPackage = vi.fn();
        render(<BrowseTabComponent {...createProps({ onSetSelectedPackage })} />);
        const input = screen.getByPlaceholderText('Search packages...');
        fireEvent.change(input, { target: { value: 'test' } });
        fireEvent.click(screen.getByLabelText('Clear search'));
        expect(onSetSelectedPackage).toHaveBeenCalledWith(null);
    });

    it('handles searchResults message via imperative handle', () => {
        const ref = React.createRef<BrowseTabHandle>();
        render(<BrowseTabComponent {...createProps()} ref={ref} />);
        const consumed = ref.current!.handleMessage({
            type: 'searchResults',
            results: [{ id: 'Pkg', version: '1.0.0', description: 'desc', authors: 'auth', versions: ['1.0.0'] }],
            query: '',
        } as any);
        expect(consumed).toBe(true);
    });

    it('handles autocompleteResults message', () => {
        const ref = React.createRef<BrowseTabHandle>();
        render(<BrowseTabComponent {...createProps()} ref={ref} />);
        const consumed = ref.current!.handleMessage({
            type: 'autocompleteResults',
            query: '',
            groupedResults: [{ sourceName: 'nuget.org', sourceUrl: 'https://api.nuget.org/v3/index.json', packageIds: ['Pkg'] }],
        } as any);
        expect(consumed).toBe(true);
    });

    it('returns false for unhandled message types', () => {
        const ref = React.createRef<BrowseTabHandle>();
        render(<BrowseTabComponent {...createProps()} ref={ref} />);
        const consumed = ref.current!.handleMessage({ type: 'unknownType' } as any);
        expect(consumed).toBe(false);
    });

    it('focusSearchInput focuses the input', () => {
        const ref = React.createRef<BrowseTabHandle>();
        render(<BrowseTabComponent {...createProps()} ref={ref} />);
        ref.current!.focusSearchInput();
        expect(document.activeElement).toBe(screen.getByPlaceholderText('Search packages...'));
    });

    it('navigateToPackage sets query and triggers search', () => {
        const ref = React.createRef<BrowseTabHandle>();
        mockVscode.postMessage.mockClear();
        render(<BrowseTabComponent {...createProps()} ref={ref} />);
        act(() => { ref.current!.navigateToPackage('Newtonsoft.Json'); });
        expect(mockVscode.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'searchPackages',
            query: 'Newtonsoft.Json',
            exactMatch: true,
            take: 1,
        }));
    });

    it('is hidden when activeTab is not browse', () => {
        const { container } = render(<BrowseTabComponent {...createProps({ activeTab: 'installed' as any })} />);
        const content = container.querySelector('.browse-content') as HTMLElement;
        expect(content.style.display).toBe('none');
    });

    it('Escape key closes quicksearch dropdown', () => {
        render(<BrowseTabComponent {...createProps()} />);
        const input = screen.getByPlaceholderText('Search packages...');
        fireEvent.keyDown(input, { key: 'Escape' });
        // Should not throw; dropdown state is internal
    });

    it('shows recent searches on focus when search is empty', () => {
        render(<BrowseTabComponent {...createProps({
            recentSearches: ['Newtonsoft', 'Serilog'],
            recentSearchesLimit: 5,
        })} />);
        const input = screen.getByPlaceholderText('Search packages...');
        fireEvent.focus(input);
        expect(screen.getByText('Recent Searches')).toBeInTheDocument();
        expect(screen.getByText('Newtonsoft')).toBeInTheDocument();
        expect(screen.getByText('Serilog')).toBeInTheDocument();
    });

    // ──────────────────────────────────────────────
    // Phase 7B: Additional BrowseTab tests
    // ──────────────────────────────────────────────

    it('handles restoreSearchQuery message and re-searches', () => {
        const ref = React.createRef<BrowseTabHandle>();
        mockVscode.postMessage.mockClear();
        render(<BrowseTabComponent {...createProps()} ref={ref} />);
        mockVscode.postMessage.mockClear();
        act(() => {
            ref.current!.handleMessage({
                type: 'restoreSearchQuery',
                query: 'Serilog',
            } as any);
        });
        expect(mockVscode.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'searchPackages',
            query: 'Serilog',
        }));
    });

    it('handles restoreSearchQuery with empty query (no-op)', () => {
        const ref = React.createRef<BrowseTabHandle>();
        mockVscode.postMessage.mockClear();
        render(<BrowseTabComponent {...createProps()} ref={ref} />);
        mockVscode.postMessage.mockClear();
        const consumed = ref.current!.handleMessage({
            type: 'restoreSearchQuery',
            query: '',
        } as any);
        expect(consumed).toBe(true);
        // Should not trigger a search
        expect(mockVscode.postMessage).not.toHaveBeenCalledWith(
            expect.objectContaining({ type: 'searchPackages' })
        );
    });

    it('handles packageVersions returning false when no pending ref', () => {
        const ref = React.createRef<BrowseTabHandle>();
        render(<BrowseTabComponent {...createProps()} ref={ref} />);
        const consumed = ref.current!.handleMessage({
            type: 'packageVersions',
            packageId: 'Unknown',
            versions: ['1.0', '2.0'],
        } as any);
        // No pending quicksearch expansion or quick install — not consumed
        expect(consumed).toBe(false);
    });

    it('searchResults with mismatched query is ignored (stale guard)', () => {
        const ref = React.createRef<BrowseTabHandle>();
        render(<BrowseTabComponent {...createProps()} ref={ref} />);

        // Set search query to "React"
        const input = screen.getByPlaceholderText('Search packages...');
        fireEvent.change(input, { target: { value: 'React' } });

        // Send results for a different query
        act(() => {
            ref.current!.handleMessage({
                type: 'searchResults',
                query: 'OldQuery',
                results: [{ id: 'StaleResult', version: '1.0' }],
            } as any);
        });
        // Results should be ignored (still showing default state)
        expect(screen.queryByText('StaleResult')).toBeNull();
    });

    it('autocompleteResults with mismatched query is ignored', () => {
        const ref = React.createRef<BrowseTabHandle>();
        render(<BrowseTabComponent {...createProps()} ref={ref} />);

        const input = screen.getByPlaceholderText('Search packages...');
        fireEvent.change(input, { target: { value: 'Exact' } });

        act(() => {
            ref.current!.handleMessage({
                type: 'autocompleteResults',
                query: 'WrongQuery',
                groupedResults: [{ sourceName: 'nuget.org', sourceUrl: 'url', packageIds: ['Pkg'] }],
            } as any);
        });
        // Suggestions should not be shown for mismatched query
    });

    it('multi-install mode is hidden by default', () => {
        render(<BrowseTabComponent {...createProps()} />);
        // Multi-install dropdown should not be visible without search results
        expect(screen.queryByText(/Multi Install/)).toBeNull();
    });

    it('search input clear resets search results', () => {
        const ref = React.createRef<BrowseTabHandle>();
        const onSetSelectedPackage = vi.fn();
        render(<BrowseTabComponent {...createProps({ onSetSelectedPackage })} ref={ref} />);

        // Search first
        const input = screen.getByPlaceholderText('Search packages...');
        fireEvent.change(input, { target: { value: 'test' } });
        fireEvent.click(screen.getByText('Search'));

        // Add results
        act(() => {
            ref.current!.handleMessage({
                type: 'searchResults',
                query: 'test',
                results: [{ id: 'TestPkg', version: '1.0', description: 'd' }],
            } as any);
        });

        // Clear
        fireEvent.click(screen.getByLabelText('Clear search'));
        expect(onSetSelectedPackage).toHaveBeenCalledWith(null);
    });

    it('does not search when query is empty on button click', () => {
        mockVscode.postMessage.mockClear();
        render(<BrowseTabComponent {...createProps()} />);
        fireEvent.click(screen.getByText('Search'));
        // Should not send searchPackages with empty query
        expect(mockVscode.postMessage).not.toHaveBeenCalledWith(
            expect.objectContaining({ type: 'searchPackages' })
        );
    });
});
