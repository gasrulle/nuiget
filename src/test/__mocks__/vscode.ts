/**
 * Comprehensive mock of the `vscode` module for unit testing.
 * Aliased via vitest.config.mts so `import * as vscode from 'vscode'` resolves here.
 */
import { vi } from 'vitest';

// ---------- Disposable ----------

export class Disposable {
    private _callOnDispose: () => void;
    constructor(callOnDispose: () => void) {
        this._callOnDispose = callOnDispose;
    }
    dispose(): void {
        this._callOnDispose();
    }
    static from(...disposables: { dispose(): void }[]): Disposable {
        return new Disposable(() => {
            for (const d of disposables) {
                d.dispose();
            }
        });
    }
}

// ---------- EventEmitter ----------

export class EventEmitter<T> {
    private _listeners: Array<(e: T) => void> = [];

    event = (listener: (e: T) => void): Disposable => {
        this._listeners.push(listener);
        return new Disposable(() => {
            const idx = this._listeners.indexOf(listener);
            if (idx >= 0) {
                this._listeners.splice(idx, 1);
            }
        });
    };

    fire(data: T): void {
        for (const listener of this._listeners) {
            listener(data);
        }
    }

    dispose(): void {
        this._listeners = [];
    }
}

// ---------- CancellationTokenSource ----------

export class CancellationTokenSource {
    token = { isCancellationRequested: false, onCancellationRequested: vi.fn() };
    cancel(): void {
        this.token.isCancellationRequested = true;
    }
    dispose(): void { }
}

// ---------- Uri ----------

export class Uri {
    readonly scheme: string;
    readonly authority: string;
    readonly path: string;
    readonly query: string;
    readonly fragment: string;
    readonly fsPath: string;

    private constructor(scheme: string, authority: string, path: string, query: string, fragment: string) {
        this.scheme = scheme;
        this.authority = authority;
        this.path = path;
        this.query = query;
        this.fragment = fragment;
        this.fsPath = process.platform === 'win32' ? path.replace(/\//g, '\\') : path;
    }

    with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri {
        return new Uri(
            change.scheme ?? this.scheme,
            change.authority ?? this.authority,
            change.path ?? this.path,
            change.query ?? this.query,
            change.fragment ?? this.fragment,
        );
    }

    toString(): string {
        return `${this.scheme}://${this.authority}${this.path}`;
    }

    static file(path: string): Uri {
        return new Uri('file', '', path.replace(/\\/g, '/'), '', '');
    }

    static parse(value: string): Uri {
        const match = value.match(/^([^:]+):\/\/([^/]*)(.*)$/);
        if (match) {
            return new Uri(match[1], match[2], match[3], '', '');
        }
        return new Uri('file', '', value, '', '');
    }

    static joinPath(base: Uri, ...pathSegments: string[]): Uri {
        const joined = [base.path, ...pathSegments].join('/').replace(/\/+/g, '/');
        return new Uri(base.scheme, base.authority, joined, base.query, base.fragment);
    }
}

// ---------- Enums ----------

export const ProgressLocation = {
    SourceControl: 1,
    Window: 10,
    Notification: 15,
} as const;

export const ViewColumn = {
    Active: -1,
    Beside: -2,
    One: 1,
    Two: 2,
    Three: 3,
} as const;

export const QuickPickItemKind = {
    Separator: -1,
    Default: 0,
} as const;

// ---------- RelativePattern ----------

export class RelativePattern {
    base: string;
    pattern: string;
    constructor(base: string | { uri?: { fsPath?: string } }, pattern: string) {
        this.base = typeof base === 'string' ? base : base?.uri?.fsPath ?? '';
        this.pattern = pattern;
    }
}

// ---------- TreeView ----------

function createMockTreeView() {
    return {
        badge: undefined,
        onDidChangeSelection: vi.fn(),
        onDidChangeVisibility: vi.fn(),
        onDidCollapseElement: vi.fn(),
        onDidExpandElement: vi.fn(),
        reveal: vi.fn(),
        dispose: vi.fn(),
    };
}

// ---------- window ----------

export const window = {
    activeTextEditor: undefined as { viewColumn?: number } | undefined,
    createWebviewPanel: vi.fn(() => createMockWebviewPanel()),
    createOutputChannel: vi.fn((_name: string, _options?: { log: true }) => createMockLogOutputChannel()),
    createTreeView: vi.fn(() => createMockTreeView()),
    registerWebviewViewProvider: vi.fn(() => new Disposable(() => { })),
    withProgress: vi.fn((_options: unknown, task: (progress: unknown, token: unknown) => Promise<unknown>) => {
        const progress = { report: vi.fn() };
        const token = { isCancellationRequested: false, onCancellationRequested: vi.fn() };
        return task(progress, token);
    }),
    showQuickPick: vi.fn(),
    createQuickPick: vi.fn(() => {
        let onAcceptCb: (() => void) | undefined;
        let onHideCb: (() => void) | undefined;
        const qp: any = {
            items: [] as any[],
            activeItems: [] as any[],
            selectedItems: [] as any[],
            placeholder: '',
            title: '',
            onDidAccept: vi.fn((cb: () => void) => { onAcceptCb = cb; return new Disposable(() => { }); }),
            onDidHide: vi.fn((cb: () => void) => { onHideCb = cb; return new Disposable(() => { }); }),
            show: vi.fn(() => {
                // Auto-resolve: if _autoSelect is set, simulate accept; otherwise simulate hide (dismiss)
                if (qp._autoSelect) {
                    qp.selectedItems = [qp._autoSelect];
                    onAcceptCb?.();
                } else {
                    onHideCb?.();
                }
            }),
            dispose: vi.fn(),
            hide: vi.fn(),
            _autoSelect: undefined as any,
        };
        return qp;
    }),
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    showWarningMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
    setStatusBarMessage: vi.fn(() => new Disposable(() => { })),
    createStatusBarItem: vi.fn((_alignment?: number, _priority?: number) => ({
        text: '',
        tooltip: '',
        command: undefined,
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
    })),
};

export const StatusBarAlignment = {
    Left: 1,
    Right: 2,
};

// ---------- workspace ----------

const defaultConfig = new Map<string, unknown>();

export const workspace = {
    workspaceFolders: [
        { uri: Uri.file('/test-workspace'), name: 'test-workspace', index: 0 },
    ],
    createFileSystemWatcher: vi.fn(() => ({
        onDidCreate: vi.fn(() => new Disposable(() => { })),
        onDidChange: vi.fn(() => new Disposable(() => { })),
        onDidDelete: vi.fn(() => new Disposable(() => { })),
        dispose: vi.fn(),
    })),
    getConfiguration: vi.fn((_section?: string) => ({
        get: vi.fn(<T>(key: string, defaultValue?: T): T | undefined => {
            const val = defaultConfig.get(key);
            return (val !== undefined ? val : defaultValue) as T | undefined;
        }),
        has: vi.fn(() => false),
        inspect: vi.fn(),
        update: vi.fn(),
    })),
    onDidChangeConfiguration: vi.fn(() => new Disposable(() => { })),
    findFiles: vi.fn(async () => []),
    fs: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        stat: vi.fn(),
    },
};

// ---------- commands ----------

const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();

export const commands = {
    registerCommand: vi.fn((command: string, callback: (...args: unknown[]) => unknown) => {
        registeredCommands.set(command, callback);
        return new Disposable(() => {
            registeredCommands.delete(command);
        });
    }),
    executeCommand: vi.fn(async (command: string, ...args: unknown[]) => {
        const handler = registeredCommands.get(command);
        if (handler) {
            return handler(...args);
        }
        return undefined;
    }),
};

// ---------- env ----------

export const env = {
    clipboard: {
        writeText: vi.fn(),
        readText: vi.fn().mockResolvedValue(''),
    },
};

// ---------- Helper factories ----------

function createMockWebview() {
    return {
        html: '',
        options: {} as { enableScripts?: boolean; localResourceRoots?: Uri[] },
        onDidReceiveMessage: vi.fn(() => new Disposable(() => { })),
        postMessage: vi.fn(async () => true),
        asWebviewUri: vi.fn((uri: Uri) => uri),
        cspSource: 'https://mock-csp-source',
    };
}

function createMockWebviewPanel() {
    const disposeEmitter = new EventEmitter<void>();
    const webview = createMockWebview();
    return {
        webview,
        viewType: 'nuiget',
        title: 'NuGet',
        iconPath: undefined,
        viewColumn: ViewColumn.One,
        active: true,
        visible: true,
        reveal: vi.fn(),
        dispose: vi.fn(() => disposeEmitter.fire()),
        onDidDispose: disposeEmitter.event,
        onDidChangeViewState: vi.fn(() => new Disposable(() => { })),
    };
}

function createMockLogOutputChannel() {
    return {
        name: 'test-channel',
        append: vi.fn(),
        appendLine: vi.fn(),
        clear: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
        replace: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        trace: vi.fn(),
        logLevel: 2,
        onDidChangeLogLevel: vi.fn(() => new Disposable(() => { })),
    };
}

// ---------- Exported factory helpers (for test setup) ----------

/** Create a mock ExtensionContext */
export function createMockExtensionContext(overrides?: Record<string, unknown>) {
    const workspaceState = new Map<string, unknown>();
    const globalState = new Map<string, unknown>();

    return {
        subscriptions: [] as { dispose(): void }[],
        extensionUri: Uri.file('/test-extension'),
        extensionPath: '/test-extension',
        storageUri: Uri.file('/test-storage'),
        globalStorageUri: Uri.file('/test-global-storage'),
        logUri: Uri.file('/test-logs'),
        extensionMode: 3,
        workspaceState: {
            get: vi.fn(<T>(key: string, defaultValue?: T) => {
                const val = workspaceState.get(key);
                return (val !== undefined ? val : defaultValue) as T | undefined;
            }),
            update: vi.fn(async (key: string, value: unknown) => {
                workspaceState.set(key, value);
            }),
            keys: vi.fn(() => [...workspaceState.keys()]),
        },
        globalState: {
            get: vi.fn(<T>(key: string, defaultValue?: T) => {
                const val = globalState.get(key);
                return (val !== undefined ? val : defaultValue) as T | undefined;
            }),
            update: vi.fn(async (key: string, value: unknown) => {
                globalState.set(key, value);
            }),
            keys: vi.fn(() => [...globalState.keys()]),
            setKeysForSync: vi.fn(),
        },
        asAbsolutePath: vi.fn((relativePath: string) => `/test-extension/${relativePath}`),
        ...overrides,
    };
}

/** Reset all mocks — call in `beforeEach` or `afterEach` */
export function resetAllMocks(): void {
    vi.restoreAllMocks();
    registeredCommands.clear();
    defaultConfig.clear();
    window.activeTextEditor = undefined;
}

// Re-export the factory for direct use
export { createMockLogOutputChannel, createMockWebview, createMockWebviewPanel };

