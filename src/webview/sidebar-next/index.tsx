import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { createMessageBus } from '../shared/bus/MessageBus';
import { StoreProvider } from '../shared/store/StoreProvider';
import '../shared/tokens.css';
import './sidebar.css';
import { SidebarView } from './SidebarView';

/** The API of VS Code inside a webview. It may be acquired once, so the entry does it and hands the bus down. */
declare function acquireVsCodeApi(): { postMessage(message: unknown): void; getState(): unknown; setState(state: unknown): void };

const rootElement = document.getElementById('sidebar-root');

if (rootElement) {
    const bus = createMessageBus(acquireVsCodeApi());
    ReactDOM.createRoot(rootElement).render(
        <StrictMode>
            <StoreProvider bus={bus}>
                <SidebarView />
            </StoreProvider>
        </StrictMode>
    );
}
