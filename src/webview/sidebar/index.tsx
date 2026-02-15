import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { SidebarApp } from './SidebarApp';

const rootElement = document.getElementById('sidebar-root');

if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <StrictMode>
            <SidebarApp />
        </StrictMode>
    );
}
