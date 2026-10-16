/** The webview's state store (`getState`/`setState` of the one `acquireVsCodeApi()`); each entry hands it down. */
export interface ViewStateStore {
    getState(): unknown;
    setState(state: unknown): void;
}
