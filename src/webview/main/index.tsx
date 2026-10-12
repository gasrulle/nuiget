import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

/** Placeholder for the 2.0 main panel, built by `node esbuild.mjs --v2`; plan item P5.3 replaces it. */
export function MainShell() {
    return <p>2.0 shell</p>;
}

const rootElement = document.getElementById('root');

if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
        <StrictMode>
            <MainShell />
        </StrictMode>
    );
}
