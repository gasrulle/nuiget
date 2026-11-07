import { useEffect, useId, useRef, useState } from 'react';
import type React from 'react';
import type { NuGetSource, RequestPayload } from '../../../../protocol';
import { Banner, Button, Checkbox, ConfirmDialog, Dialog, EmptyState, IconButton, ProgressBar, Select, TextField, TrashIcon } from '../../../shared/primitives';
import { useConfig } from '../../../shared/store/config';
import { useSources } from '../../../shared/store/sources';

export interface SourceSettingsDialogProps {
    open: boolean;
    onClose: () => void;
    /** Says a sentence through the one live region of the panel. */
    announce: (message: string) => void;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A message as one sentence: one full stop at its end. */
const sentence = (text: string): string => `${text.replace(/\.+$/, '')}.`;

/** The test id of a source's row: its name lower-cased. */
export const sourceRowId = (name: string): string => `source-row-${name.toLowerCase()}`;

function SourceRow({ source, fileLabel, announce, onRemove }: { source: NuGetSource; fileLabel: string | undefined; announce: (message: string) => void; onRemove: (source: NuGetSource) => void }): React.JSX.Element {
    const { pending, setEnabled } = useSources();
    const busy = pending.has(source.name);
    const toggleId = useId();
    const urlId = useId();
    const fileId = useId();

    const toggle = (): void => {
        setEnabled(source.name, !source.enabled).then(
            () => announce(`${source.name} ${source.enabled ? 'disabled' : 'enabled'}`),
            (error: unknown) => announce(`${source.name} could not be ${source.enabled ? 'disabled' : 'enabled'}: ${messageOf(error)}`),
        );
    };

    // The check box is named by the source alone; its URL and the file that declares it describe it (UX-P3.6).
    return (
        <li className="nuiget-source-row" data-testid={sourceRowId(source.name)} aria-busy={busy || undefined}>
            <Checkbox id={toggleId} checked={source.enabled} disabled={busy} onChange={toggle} aria-describedby={source.configFile ? `${urlId} ${fileId}` : urlId} />
            <span className="nuiget-source-text">
                <label htmlFor={toggleId} className={source.enabled ? 'nuiget-source-name' : 'nuiget-source-name nuiget-source-name--off'}>{source.name}</label>
                <span id={urlId} className="nuiget-source-url">{source.url}</span>
                {source.configFile ? <span id={fileId} className="nuiget-source-config">{fileLabel ?? source.configFile}</span> : null}
            </span>
            <IconButton label={`Remove ${source.name}`} data-testid={`source-row-remove-${source.name.toLowerCase()}`} disabled={busy} onClick={() => onRemove(source)}><TrashIcon /></IconButton>
        </li>
    );
}

/**
 * A password that holds a `%VAR%` placeholder anywhere: the reader expands it from the environment in clear text only, so
 * such a value is never encrypted (N82, UX-P3.6).
 */
const ENVIRONMENT_PLACEHOLDER = /%[^%\s]+%/;

/** Whether a password holds an environment placeholder (`%VAR%`) anywhere. */
export const hasEnvironmentPlaceholder = (password: string): boolean => ENVIRONMENT_PLACEHOLDER.test(password.trim());

function AddSourcePanel({ onDone, announce }: { onDone: () => void; announce: (message: string) => void }): React.JSX.Element {
    const { add, configFiles, loadConfigFiles, pending } = useSources();
    const { config } = useConfig();
    const isWindows = config?.isWindows === true;
    const [url, setUrl] = useState('');
    const [name, setName] = useState('');
    const [configFile, setConfigFile] = useState('');
    const [advanced, setAdvanced] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [storeEncrypted, setStoreEncrypted] = useState(isWindows);
    const [allowInsecure, setAllowInsecure] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const ids = useId();
    const urlRef = useRef<HTMLInputElement>(null);

    useEffect(() => loadConfigFiles(), [loadConfigFiles]);
    // The form takes the place of the list: focus goes to its first field.
    useEffect(() => urlRef.current?.focus(), []);
    const chosenFile = configFile || configFiles?.[0]?.path || '';
    const insecure = /^http:\/\//i.test(url.trim());
    const adding = pending.has(name.trim() || url.trim());
    const placeholder = hasEnvironmentPlaceholder(password);

    const submit = (event: React.FormEvent): void => {
        event.preventDefault();
        const trimmed = url.trim();
        if (trimmed.length === 0) {
            setError('Enter the URL of the source.');
            return;
        }
        try {
            new URL(trimmed);
        } catch {
            setError('Enter a valid URL, such as https://api.nuget.org/v3/index.json.');
            return;
        }
        const payload: RequestPayload<'sources/add'> = { url: trimmed };
        if (name.trim()) {
            payload.name = name.trim();
        }
        if (chosenFile) {
            payload.configFile = chosenFile;
        }
        if (username) {
            payload.username = username;
        }
        if (password) {
            payload.password = password;
            payload.storeEncrypted = isWindows && storeEncrypted && !placeholder;
        }
        if (insecure && allowInsecure) {
            payload.allowInsecure = true;
        }
        setError(null);
        add(payload).then(
            () => {
                announce(`${payload.name ?? trimmed} added`);
                onDone();
            },
            (refused: unknown) => setError(messageOf(refused)),
        );
    };

    return (
        // noValidate: the form validates inline, the platform's constraint bubble would block the submit (UX-P3.6).
        <form className="nuiget-add-source" data-testid="add-source-panel" noValidate onSubmit={submit} aria-label="Add a source">
            {configFiles !== undefined && configFiles.length > 0 ? (
                <div className="nuiget-field">
                    <label htmlFor={`${ids}-file`}>Add to config file</label>
                    <Select id={`${ids}-file`} value={chosenFile} onChange={setConfigFile}>
                        {configFiles.map(file => <option key={file.path} value={file.path}>{file.label}</option>)}
                    </Select>
                </div>
            ) : null}
            <div className="nuiget-field">
                <label htmlFor={`${ids}-url`}>URL</label>
                <TextField ref={urlRef} id={`${ids}-url`} data-testid="add-source-url" type="url" required value={url} placeholder="https://api.nuget.org/v3/index.json" aria-invalid={error !== null || undefined} aria-describedby={error ? `${ids}-error` : undefined} onChange={value => { setUrl(value); setError(null); }} />
                {error ? <div id={`${ids}-error`}><Banner severity="error" data-testid="add-source-error">{error}</Banner></div> : null}
            </div>
            {insecure ? (
                <>
                    <Banner severity="warning">This source uses HTTP, which is not encrypted.</Banner>
                    <div className="nuiget-field">
                        <label>
                            <Checkbox checked={allowInsecure} onChange={checked => setAllowInsecure(checked)} />
                            Allow an insecure (HTTP) connection to this source
                        </label>
                    </div>
                </>
            ) : null}
            <div className="nuiget-field">
                <label htmlFor={`${ids}-name`}>Name (optional)</label>
                <TextField id={`${ids}-name`} value={name} placeholder="Made from the URL when empty" onChange={setName} />
            </div>
            <Button variant="secondary" data-testid="add-source-credentials" aria-expanded={advanced} onClick={() => setAdvanced(previous => !previous)}>Credentials</Button>
            {advanced ? (
                <>
                    <div className="nuiget-field">
                        <label htmlFor={`${ids}-user`}>Username</label>
                        <TextField id={`${ids}-user`} autoComplete="off" value={username} onChange={setUsername} />
                    </div>
                    <div className="nuiget-field">
                        <label htmlFor={`${ids}-password`}>Password</label>
                        <TextField id={`${ids}-password`} data-testid="add-source-password" type="password" autoComplete="off" value={password} placeholder="Password, or %ENV_VAR% (stored in clear text and read from the environment)" onChange={setPassword} />
                    </div>
                    {password ? (
                        <label className="nuiget-field" data-testid="add-source-clear-text">
                            <Checkbox checked={isWindows && storeEncrypted && !placeholder} disabled={!isWindows || placeholder} onChange={checked => setStoreEncrypted(checked)} />
                            {placeholder
                                ? 'Stored in clear text: a %VAR% placeholder is read from the environment when the source is used'
                                : isWindows ? 'Store the password encrypted' : 'Store the password encrypted (Windows only); it is stored in clear text'}
                        </label>
                    ) : null}
                </>
            ) : null}
            <div className="nuiget-add-source-actions">
                <Button variant="secondary" onClick={onDone}>Back</Button>
                <Button type="submit" data-testid="add-source-submit" disabled={adding}>{adding ? 'Adding…' : 'Add source'}</Button>
            </div>
        </form>
    );
}

/**
 * The NuGet sources of the main panel (interaction model §5): every source of the selected project's config chain
 * with a checkbox that enables it, where it is declared, and Remove with an in-dialog confirmation; Add source opens a
 * form in the same dialog (config file, URL, name, credentials; an HTTP source only with the insecure option, which
 * SDK 10 requires). The list follows the sources slice, which asks it again when the host says it changed.
 */
export function SourceSettingsDialog({ open, onClose, announce }: SourceSettingsDialogProps): React.JSX.Element | null {
    const { sources, status, error, refresh, enable, revalidating, remove, configFiles, loadConfigFiles } = useSources();
    const [adding, setAdding] = useState(false);
    /** The source whose removal is being confirmed: one confirmation per dialog (UX-P3.6). */
    const [removing, setRemoving] = useState<NuGetSource | null>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const addButton = useRef<HTMLButtonElement>(null);
    const wasAdding = useRef(false);

    useEffect(() => {
        if (open) {
            enable();
            loadConfigFiles();
        } else {
            setAdding(false);
        }
    }, [open, enable, loadConfigFiles]);
    // Back from the form: focus returns to the button that opened it, inside the dialog.
    useEffect(() => {
        if (wasAdding.current && !adding) {
            addButton.current?.focus();
        }
        wasAdding.current = adding;
    }, [adding]);

    // The file's label for display only: verbatim, then case-insensitively; a file above the workspace folder has none (the path shows).
    const labelOf = (path: string | undefined): string | undefined => (path === undefined ? undefined
        : configFiles?.find(file => file.path === path)?.label ?? configFiles?.find(file => file.path.toLowerCase() === path.toLowerCase())?.label);
    const confirmRemove = (): void => {
        const source = removing;
        setRemoving(null);
        if (source === null) {
            return;
        }
        // The row goes: focus moves to the next row's Remove, else to Add source (UX-P3.6).
        const rows = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('.nuiget-source-row .nuiget-icon-button') ?? [])];
        const index = rows.findIndex(button => button.dataset.testid === `source-row-remove-${source.name.toLowerCase()}`);
        const next = rows[index + 1] ?? rows[index - 1];
        queueMicrotask(() => (next ?? addButton.current)?.focus());
        remove(source.name, source.configFile).then(
            () => announce(`${source.name} removed`),
            (removeError: unknown) => announce(`${source.name} could not be removed: ${messageOf(removeError)}`),
        );
    };

    let body: React.ReactNode;
    if (adding) {
        body = <AddSourcePanel announce={announce} onDone={() => setAdding(false)} />;
    } else {
        // The cells of the list (DS-STATE-1..4): a bar over the top while it loads or refreshes, the error above the kept
        // rows, the welcome-style empty sentence; every rhythm is a gap.
        const loading = status === 'loading' || revalidating;
        body = (
            <div className="nuiget-sources">
                {loading ? <div className="nuiget-sources-progress"><ProgressBar label="Loading sources" data-testid="source-settings-progress" /></div> : null}
                {error !== undefined && !revalidating
                    ? <Banner severity="error" data-testid="source-settings-error" action={{ label: 'Retry', onClick: refresh }}>{`The sources could not be listed: ${sentence(error.message)}`}</Banner>
                    : null}
                {sources === undefined && error === undefined ? <div role="status">Loading sources…</div> : null}
                {sources?.length === 0 ? <EmptyState message="No package sources." data-testid="source-settings-empty" /> : null}
                {sources !== undefined && sources.length > 0 ? (
                    <ul ref={listRef} className="nuiget-source-list" data-testid="source-settings-list" aria-label="NuGet sources" aria-busy={revalidating || undefined}>
                        {sources.map(source => <SourceRow key={source.name} source={source} fileLabel={labelOf(source.configFile)} announce={announce} onRemove={setRemoving} />)}
                    </ul>
                ) : null}
            </div>
        );
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={adding ? 'Add a NuGet source' : 'NuGet sources'}
            description={adding ? undefined : 'Sources of the selected project\'s config files. Remove deletes a source from the file that declares it.'}
            closeLabel="Close NuGet sources"
            data-testid="source-settings-modal"
            footer={adding ? undefined : <Button ref={addButton} data-testid="add-source-button" onClick={() => setAdding(true)}>Add source</Button>}
        >
            {body}
            <ConfirmDialog
                open={removing !== null}
                title={`Remove ${removing?.name ?? ''}?`}
                confirmLabel="Remove"
                onConfirm={confirmRemove}
                onCancel={() => setRemoving(null)}
            >
                {removing === null ? null : `Removes ${removing.name} from ${removing.configFile ?? 'the nearest config file'}. This cannot be undone.`}
            </ConfirmDialog>
        </Dialog>
    );
}
