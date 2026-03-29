import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { NuGetSource } from '../types';
import { MemoizedSourceSettingsOverlay, SourceSettingsOverlayHandle } from './SourceSettingsOverlay';

const mockSources: NuGetSource[] = [
    { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true },
    { name: 'myget', url: 'https://myget.org/F/test/api/v3/index.json', enabled: false },
];

function createProps(overrides: Partial<Parameters<typeof MemoizedSourceSettingsOverlay>[0]> = {}) {
    return {
        sources: mockSources,
        configFiles: [{ label: 'NuGet.Config', path: '/root/NuGet.Config' }],
        selectedConfigFile: '/root/NuGet.Config',
        onSelectedConfigFileChange: vi.fn(),
        isWindows: true,
        togglingSource: null,
        removingSource: null,
        vscode: { postMessage: vi.fn(), getState: vi.fn(), setState: vi.fn() },
        onClose: vi.fn(),
        onToggleSource: vi.fn(),
        onRemoveSource: vi.fn(),
        ...overrides,
    };
}

describe('SourceSettingsOverlay', () => {
    it('renders source list', () => {
        render(<MemoizedSourceSettingsOverlay {...createProps()} />);
        expect(screen.getByText('nuget.org')).toBeInTheDocument();
        expect(screen.getByText('myget')).toBeInTheDocument();
    });

    it('shows urls of sources', () => {
        render(<MemoizedSourceSettingsOverlay {...createProps()} />);
        expect(screen.getByText('https://api.nuget.org/v3/index.json')).toBeInTheDocument();
    });

    it('shows empty state when no sources', () => {
        render(<MemoizedSourceSettingsOverlay {...createProps({ sources: [] })} />);
        expect(screen.getByText('No NuGet sources configured.')).toBeInTheDocument();
    });

    it('closes on overlay click', () => {
        const onClose = vi.fn();
        const { container } = render(<MemoizedSourceSettingsOverlay {...createProps({ onClose })} />);
        fireEvent.click(container.querySelector('.source-settings-overlay')!);
        expect(onClose).toHaveBeenCalled();
    });

    it('does not close on modal body click', () => {
        const onClose = vi.fn();
        const { container } = render(<MemoizedSourceSettingsOverlay {...createProps({ onClose })} />);
        fireEvent.click(container.querySelector('.source-settings-modal')!);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('toggles source on checkbox change', () => {
        const onToggleSource = vi.fn();
        render(<MemoizedSourceSettingsOverlay {...createProps({ onToggleSource })} />);
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]);
        expect(onToggleSource).toHaveBeenCalledWith(mockSources[0]);
    });

    it('disables checkbox when toggling', () => {
        render(<MemoizedSourceSettingsOverlay {...createProps({ togglingSource: 'nuget.org' })} />);
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes[0]).toBeDisabled();
    });

    it('shows + Add Source button', () => {
        render(<MemoizedSourceSettingsOverlay {...createProps()} />);
        expect(screen.getByText('+ Add Source')).toBeInTheDocument();
    });

    it('shows add source panel on + Add Source click', () => {
        render(<MemoizedSourceSettingsOverlay {...createProps()} />);
        fireEvent.click(screen.getByText('+ Add Source'));
        expect(screen.getByText('Add New Source')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('https://api.nuget.org/v3/index.json')).toBeInTheDocument();
    });

    it('sends addSource message on Add Source submit', () => {
        const vscode = { postMessage: vi.fn(), getState: vi.fn(), setState: vi.fn() };
        render(<MemoizedSourceSettingsOverlay {...createProps({ vscode })} />);
        fireEvent.click(screen.getByText('+ Add Source'));
        const urlInput = screen.getByPlaceholderText('https://api.nuget.org/v3/index.json');
        fireEvent.change(urlInput, { target: { value: 'https://my-feed.com/v3/index.json' } });
        fireEvent.click(screen.getByText('Add Source'));
        expect(vscode.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'addSource',
            url: 'https://my-feed.com/v3/index.json',
        }));
    });

    it('disables Add Source button when URL is empty', () => {
        render(<MemoizedSourceSettingsOverlay {...createProps()} />);
        fireEvent.click(screen.getByText('+ Add Source'));
        expect(screen.getByText('Add Source')).toBeDisabled();
    });

    it('shows confirm remove dialog on trash click', () => {
        render(<MemoizedSourceSettingsOverlay {...createProps()} />);
        const trashBtns = screen.getAllByTitle('Remove from nearest config file');
        fireEvent.click(trashBtns[0]);
        expect(screen.getByText(/Are you sure you want to remove/)).toBeInTheDocument();
    });

    it('calls onRemoveSource on confirm remove', () => {
        const onRemoveSource = vi.fn();
        render(<MemoizedSourceSettingsOverlay {...createProps({ onRemoveSource })} />);
        const trashBtns = screen.getAllByTitle('Remove from nearest config file');
        fireEvent.click(trashBtns[0]);
        fireEvent.click(screen.getByText('Remove'));
        expect(onRemoveSource).toHaveBeenCalledWith('nuget.org', undefined);
    });

    it('cancels remove dialog', () => {
        render(<MemoizedSourceSettingsOverlay {...createProps()} />);
        const trashBtns = screen.getAllByTitle('Remove from nearest config file');
        fireEvent.click(trashBtns[0]);
        // The confirm dialog has its own Cancel button — find in confirm-dialog-footer
        const confirmDialog = screen.getByText(/Are you sure you want to remove/).closest('.confirm-dialog')!;
        const cancelBtn = confirmDialog.querySelector('.confirm-dialog-footer .btn-secondary') as HTMLElement;
        fireEvent.click(cancelBtn);
        expect(screen.queryByText(/Are you sure you want to remove/)).not.toBeInTheDocument();
    });

    it('toggles advanced options', () => {
        render(<MemoizedSourceSettingsOverlay {...createProps()} />);
        fireEvent.click(screen.getByText('+ Add Source'));
        fireEvent.click(screen.getByText('Advanced'));
        expect(screen.getByPlaceholderText('Optional - supports %ENV_VAR% syntax')).toBeInTheDocument();
    });

    it('shows HTTP warning for http:// URL', () => {
        render(<MemoizedSourceSettingsOverlay {...createProps()} />);
        fireEvent.click(screen.getByText('+ Add Source'));
        const urlInput = screen.getByPlaceholderText('https://api.nuget.org/v3/index.json');
        fireEvent.change(urlInput, { target: { value: 'http://insecure-feed.com/v3/index.json' } });
        expect(screen.getByTitle('HTTP connections are insecure. HTTPS is recommended.')).toBeInTheDocument();
    });

    it('handles addSourceResult via imperative handle', () => {
        const ref = React.createRef<SourceSettingsOverlayHandle>();
        render(<MemoizedSourceSettingsOverlay {...createProps()} ref={ref} />);
        // Open add panel
        fireEvent.click(screen.getByText('+ Add Source'));
        // Type URL and submit
        const urlInput = screen.getByPlaceholderText('https://api.nuget.org/v3/index.json');
        fireEvent.change(urlInput, { target: { value: 'https://test.com' } });
        fireEvent.click(screen.getByText('Add Source'));
        expect(screen.getByText('Adding...')).toBeInTheDocument();
        // Simulate result
        act(() => { ref.current!.handleAddSourceResult(true); });
        // Add panel should close on success
        expect(screen.queryByText('Adding...')).not.toBeInTheDocument();
    });

    it('shows error on addSourceResult failure', () => {
        const ref = React.createRef<SourceSettingsOverlayHandle>();
        render(<MemoizedSourceSettingsOverlay {...createProps()} ref={ref} />);
        fireEvent.click(screen.getByText('+ Add Source'));
        const urlInput = screen.getByPlaceholderText('https://api.nuget.org/v3/index.json');
        fireEvent.change(urlInput, { target: { value: 'https://test.com' } });
        fireEvent.click(screen.getByText('Add Source'));
        act(() => { ref.current!.handleAddSourceResult(false, 'Source already exists'); });
        expect(screen.getByText('Source already exists')).toBeInTheDocument();
    });

    it('goes back from add panel on Back click', () => {
        render(<MemoizedSourceSettingsOverlay {...createProps()} />);
        fireEvent.click(screen.getByText('+ Add Source'));
        expect(screen.getByText('Add New Source')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Back'));
        // Main panel should be visible again (slide-out class removed)
        expect(screen.getByText('NuGet Sources')).toBeInTheDocument();
    });
});
