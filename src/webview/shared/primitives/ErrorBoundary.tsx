import { Component, Fragment } from 'react';
import type React from 'react';
import { EmptyState } from './EmptyState';
import './primitives.css';

export interface ErrorBoundaryProps {
    /** Told of every rendering error the boundary catches, with React's component stack. */
    onError?: (error: Error, componentStack?: string) => void;
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    error?: Error;
    /** Goes up on Reload, so the tree below mounts anew with fresh state. */
    generation: number;
}

/**
 * Catches a rendering error of the tree below and shows the error state with Reload in its place (P9.9). React lets
 * only a class component catch one. Reload remounts everything under the boundary, which is why each entry puts it
 * outside the store: a crash that came from store state does not repeat.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    override state: ErrorBoundaryState = { generation: 0 };

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { error };
    }

    override componentDidCatch(error: Error, info: React.ErrorInfo): void {
        this.props.onError?.(error, info.componentStack ?? undefined);
    }

    private readonly reset = (): void => {
        this.setState(previous => ({ error: undefined, generation: previous.generation + 1 }));
    };

    override render(): React.ReactNode {
        if (this.state.error !== undefined) {
            return <EmptyState message="Something went wrong in this view." action={{ label: 'Reload', onClick: this.reset }} />;
        }
        return <Fragment key={this.state.generation}>{this.props.children}</Fragment>;
    }
}
