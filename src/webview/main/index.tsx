import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import type { RequestPayload } from '../../protocol';
import { createMessageBus } from '../shared/bus/MessageBus';
import { ErrorBoundary } from '../shared/primitives';
import { StoreProvider } from '../shared/store/StoreProvider';
import '../shared/tokens.css';
import './main.css';
import { DetailsPane } from './features/details/DetailsPane';
import { InstalledTab } from './features/installed/InstalledTab';
import { BrowseList } from './features/search/BrowseList';
import { UpdatesTab } from './features/updates/UpdatesTab';
import { MainShell } from './MainShell';

/** The API of VS Code inside a webview. It may be acquired once, so the entry does it and hands the bus down. */
declare function acquireVsCodeApi(): { postMessage(message: unknown): void; getState(): unknown; setState(state: unknown): void };

const rootElement = document.getElementById('root');

if (rootElement) {
    const api = acquireVsCodeApi();
    const bus = createMessageBus(api);
    // A rendering error reaches the host's output channel; the boundary shows Reload in place of the panel.
    const report = (error: Error, componentStack?: string): void => {
        const payload: RequestPayload<'ui/reportError'> = { message: error.message };
        if (error.stack) {
            payload.stack = error.stack;
        }
        if (componentStack) {
            payload.componentStack = componentStack;
        }
        void bus.request('ui/reportError', payload).catch(() => undefined);
    };
    ReactDOM.createRoot(rootElement).render(
        <StrictMode>
            <ErrorBoundary onError={report}>
                <StoreProvider bus={bus}>
                    <MainShell viewState={api} installed={view => <InstalledTab {...view} />} updates={view => <UpdatesTab {...view} />} browse={view => <BrowseList {...view} />} details={view => <DetailsPane {...view} />} />
                </StoreProvider>
            </ErrorBoundary>
        </StrictMode>
    );
}
