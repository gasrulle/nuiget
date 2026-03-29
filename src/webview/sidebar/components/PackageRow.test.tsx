import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PackageRow } from './PackageRow';

describe('PackageRow', () => {
    const defaultProps = {
        packageId: 'Newtonsoft.Json',
        version: '13.0.3',
        onPrimaryAction: vi.fn(),
        onContextMenu: vi.fn(),
    };

    describe('browse context', () => {
        it('renders package name and version', () => {
            render(<PackageRow {...defaultProps} context="browse" />);
            expect(screen.getByText('Newtonsoft.Json')).toBeInTheDocument();
            expect(screen.getByText('13.0.3')).toBeInTheDocument();
        });

        it('shows Install action button when not installed', () => {
            render(<PackageRow {...defaultProps} context="browse" />);
            expect(screen.getByLabelText('Install (Enter) Newtonsoft.Json')).toBeInTheDocument();
        });

        it('shows Uninstall action button when already installed', () => {
            render(<PackageRow {...defaultProps} context="browse" installedVersion="12.0.0" />);
            expect(screen.getByLabelText('Uninstall (Del) Newtonsoft.Json')).toBeInTheDocument();
        });

        it('renders description when provided', () => {
            render(<PackageRow {...defaultProps} context="browse" description="A JSON framework" />);
            expect(screen.getByText('A JSON framework')).toBeInTheDocument();
        });
    });

    describe('installed context', () => {
        it('shows Uninstall action', () => {
            render(<PackageRow {...defaultProps} context="installed" installedVersion="13.0.3" />);
            expect(screen.getByLabelText('Uninstall (Del) Newtonsoft.Json')).toBeInTheDocument();
        });

        it('displays installed version', () => {
            render(<PackageRow {...defaultProps} context="installed" installedVersion="12.0.0" />);
            expect(screen.getByText('12.0.0')).toBeInTheDocument();
        });
    });

    describe('updates context', () => {
        it('shows Update action', () => {
            render(<PackageRow {...defaultProps} context="updates" installedVersion="12.0" latestVersion="13.0" />);
            expect(screen.getByLabelText('Update (Enter) Newtonsoft.Json')).toBeInTheDocument();
        });

        it('displays version range with arrow', () => {
            render(<PackageRow {...defaultProps} context="updates" installedVersion="12.0" latestVersion="13.0" />);
            const option = screen.getByRole('option');
            expect(option).toHaveAttribute('aria-label', 'Newtonsoft.Json 12.0 → 13.0');
        });
    });

    describe('interactions', () => {
        it('calls onPrimaryAction on button click', () => {
            const onPrimaryAction = vi.fn();
            render(<PackageRow {...defaultProps} context="browse" onPrimaryAction={onPrimaryAction} />);
            fireEvent.click(screen.getByLabelText('Install (Enter) Newtonsoft.Json'));
            expect(onPrimaryAction).toHaveBeenCalledWith('Newtonsoft.Json');
        });

        it('calls onContextMenu on right-click', () => {
            const onContextMenu = vi.fn();
            render(<PackageRow {...defaultProps} context="browse" onContextMenu={onContextMenu} />);
            fireEvent.contextMenu(screen.getByRole('option'));
            expect(onContextMenu).toHaveBeenCalledWith('Newtonsoft.Json', expect.anything());
        });

        it('calls onClick when provided', () => {
            const onClick = vi.fn();
            render(<PackageRow {...defaultProps} context="browse" onClick={onClick} />);
            fireEvent.click(screen.getByRole('option'));
            expect(onClick).toHaveBeenCalledWith('Newtonsoft.Json');
        });
    });

    describe('selection', () => {
        it('applies selected class and aria-selected', () => {
            render(<PackageRow {...defaultProps} context="browse" selected={true} />);
            const option = screen.getByRole('option');
            expect(option).toHaveClass('selected');
            expect(option).toHaveAttribute('aria-selected', 'true');
        });

        it('unselected has aria-selected=false', () => {
            render(<PackageRow {...defaultProps} context="browse" />);
            expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'false');
        });
    });

    describe('accessibility', () => {
        it('has option role', () => {
            render(<PackageRow {...defaultProps} context="browse" />);
            expect(screen.getByRole('option')).toBeInTheDocument();
        });

        it('action button is not in tab order', () => {
            render(<PackageRow {...defaultProps} context="browse" />);
            const btn = screen.getByLabelText('Install (Enter) Newtonsoft.Json');
            expect(btn).toHaveAttribute('tabindex', '-1');
        });

        it('sets data-package-id', () => {
            render(<PackageRow {...defaultProps} context="browse" />);
            expect(screen.getByRole('option')).toHaveAttribute('data-package-id', 'Newtonsoft.Json');
        });
    });
});
