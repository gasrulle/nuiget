import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

/** Placeholder for the 2.0 sidebar, built by `node esbuild.mjs --v2`; plan item P3.4 replaces it. */
export function SidebarShell() {
    return <p>2.0 shell</p>;
}

const rootElement = document.getElementById('sidebar-root');

if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
        <StrictMode>
            <SidebarShell />
        </StrictMode>
    );
}
