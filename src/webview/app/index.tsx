import { Component, ErrorInfo, ReactNode, StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

/**
 * Error Boundary component to catch render errors gracefully.
 * Displays a fallback UI instead of crashing the entire webview.
 */
class ErrorBoundary extends Component<
    { children: ReactNode },
    { hasError: boolean; error: Error | null }
> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('React Error Boundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '20px',
                    color: 'var(--vscode-errorForeground)',
                    backgroundColor: 'var(--vscode-inputValidation-errorBackground)',
                    border: '1px solid var(--vscode-inputValidation-errorBorder)',
                    borderRadius: '4px',
                    margin: '20px',
                    fontFamily: 'var(--vscode-font-family)'
                }}>
                    <h2 style={{ margin: '0 0 10px 0' }}>Something went wrong</h2>
                    <p style={{ margin: '0 0 10px 0' }}>
                        The NuGet Package Manager encountered an error. Please try reloading the panel.
                    </p>
                    <details style={{ cursor: 'pointer' }}>
                        <summary>Error details</summary>
                        <pre style={{
                            marginTop: '10px',
                            padding: '10px',
                            backgroundColor: 'var(--vscode-textCodeBlock-background)',
                            borderRadius: '4px',
                            overflow: 'auto',
                            fontSize: '12px'
                        }}>
                            {this.state.error?.message}
                            {'\n\n'}
                            {this.state.error?.stack}
                        </pre>
                    </details>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: '15px',
                            padding: '8px 16px',
                            backgroundColor: 'var(--vscode-button-background)',
                            color: 'var(--vscode-button-foreground)',
                            border: 'none',
                            borderRadius: '2px',
                            cursor: 'pointer'
                        }}
                    >
                        Reload Panel
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <StrictMode>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </StrictMode>
    );
}
