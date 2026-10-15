import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { createMessageBus } from '../shared/bus/MessageBus';
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
    const bus = createMessageBus(acquireVsCodeApi());
    ReactDOM.createRoot(rootElement).render(
        <StrictMode>
            <StoreProvider bus={bus}>
                <MainShell installed={view => <InstalledTab {...view} />} updates={view => <UpdatesTab {...view} />} browse={view => <BrowseList {...view} />} details={view => <DetailsPane {...view} />} />
            </StoreProvider>
        </StrictMode>
    );
}
