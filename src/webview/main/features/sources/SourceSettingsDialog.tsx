import { useEffect, useId, useRef, useState } from 'react';
import type React from 'react';
import type { NuGetSource, RequestPayload } from '../../../../protocol';
import { Banner, Button, Checkbox, Dialog, EmptyState, IconButton, Select, TextField, TrashIcon, WarningIcon } from '../../../shared/primitives';
import { useConfig } from '../../../shared/store/config';
import { useSources } from '../../../shared/store/sources';

export interface SourceSettingsDialogProps {
    open: boolean;
    onClose: () => void;
    /** Says a sentence through the one live region of the panel. */
    announce: (message: string) => void;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The test id of a source's row: its name lower-cased. */
export const sourceRowId = (name: string): string => `source-row-${name.toLowerCase()}`;

function SourceRow({ source, announce }: { source: NuGetSource; announce: (message: string) => void }): React.JSX.Element {
    const { pending, setEnabled, remove } = useSources();
    const [confirming, setConfirming] = useState(false);
    const busy = pending.has(source.name);
    const toggleId = useId();

    const toggle = (): void => {
        setEnabled(source.name, !source.enabled).then(
            () => announce(`${source.name} ${source.enabled ? 'disabled' : 'enabled'}`),
            (error: unknown) => announce(`${source.name} could not be ${source.enabled ? 'disabled' : 'enabled'}: ${messageOf(error)}`),
        );
    };
    const confirmRemove = (): void => {
        setConfirming(false);
        remove(source.name, source.configFile).then(
            () => announce(`${source.name} removed`),
            (error: unknown) => announce(`${source.name} could not be removed: ${messageOf(error)}`),
        );
    };

    return (
        <li className="nuiget-source-row" data-testid={sourceRowId(source.name)} aria-busy={busy || undefined}>
            <Checkbox id={toggleId} checked={source.enabled} disabled={busy} onChange={toggle} />
            <label htmlFor={toggleId} className="nuiget-source-text">
                <span className={source.enabled ? 'nuiget-source-name' : 'nuiget-source-name nuiget-source-name--off'}>{source.name}</span>
                <span className="nuiget-source-url">{source.url}</span>
                {source.configFile ? <span className="nuiget-source-config">{source.configFile}</span> : null}
            </label>
            {confirming ? (
                <span className="nuiget-source-confirm" role="group" aria-label={`Remove ${source.name}?`}>
                    <span>{`Remove ${source.name} from ${source.configFile ?? 'the nearest config file'}?`}</span>
                    <Button onClick={confirmRemove}>Remove</Button>
                    <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
                </span>
            ) : (
                <IconButton label={`Remove ${source.name}`} disabled={busy} onClick={() => setConfirming(true)}><TrashIcon /></IconButton>
            )}
        </li>
    );
}

/**
 * A password that is one `%VAR%` placeholder: the reader expands it from the environment in clear text only, so such a
 * value is never encrypted (N82).
 */
const ENVIRONMENT_PLACEHOLDER = /^%[^%\s]+%$/;

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
    const placeholder = ENVIRONMENT_PLACEHOLDER.test(password.trim());

    const submit = (event: React.FormEvent): void => {
        event.preventDefault();
        const trimmed = url.trim();
        if (trimmed.length === 0) {
            setError('Enter the URL of the source.');
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
        <form className="nuiget-add-source" data-testid="add-source-panel" onSubmit={submit} aria-label="Add a source">
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
                <TextField ref={urlRef} id={`${ids}-url`} type="url" required value={url} placeholder="https://api.nuget.org/v3/index.json" aria-invalid={error !== null || undefined} aria-describedby={error ? `${ids}-error` : undefined} onChange={value => { setUrl(value); setError(null); }} />
            </div>
            {insecure ? (
                <div className="nuiget-field nuiget-field--warning">
                    <WarningIcon />
                    <label>
                        <Checkbox checked={allowInsecure} onChange={checked => setAllowInsecure(checked)} />
                        Allow an insecure (HTTP) connection to this source
                    </label>
                </div>
            ) : null}
            {error ? <p id={`${ids}-error`} className="nuiget-field-error" role="alert">{error}</p> : null}
            <div className="nuiget-field">
                <label htmlFor={`${ids}-name`}>Name (optional)</label>
                <TextField id={`${ids}-name`} value={name} placeholder="Made from the URL when empty" onChange={setName} />
            </div>
            <Button variant="secondary" aria-expanded={advanced} onClick={() => setAdvanced(previous => !previous)}>Credentials</Button>
            {advanced ? (
                <>
                    <div className="nuiget-field">
                        <label htmlFor={`${ids}-user`}>Username</label>
                        <TextField id={`${ids}-user`} autoComplete="off" value={username} onChange={setUsername} />
                    </div>
                    <div className="nuiget-field">
                        <label htmlFor={`${ids}-password`}>Password</label>
                        <TextField id={`${ids}-password`} type="password" autoComplete="off" value={password} placeholder="Password, or %ENV_VAR% (stored in clear text and read from the environment)" onChange={setPassword} />
                    </div>
                    {password ? (
                        <label className="nuiget-field">
                            <Checkbox checked={isWindows && storeEncrypted && !placeholder} disabled={!isWindows || placeholder} onChange={checked => setStoreEncrypted(checked)} />
                            {placeholder
                                ? 'Stored in clear text: %VAR% is read from the environment when the source is used'
                                : isWindows ? 'Store the password encrypted' : 'Store the password encrypted (Windows only); it is stored in clear text'}
                        </label>
                    ) : null}
                </>
            ) : null}
            <div className="nuiget-add-source-actions">
                <Button variant="secondary" onClick={onDone}>Back</Button>
                <Button type="submit" disabled={adding}>{adding ? 'Adding…' : 'Add source'}</Button>
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
    const { sources, status, error, refresh, enable } = useSources();
    const [adding, setAdding] = useState(false);
    const addButton = useRef<HTMLButtonElement>(null);
    const wasAdding = useRef(false);

    useEffect(() => {
        if (open) {
            enable();
        } else {
            setAdding(false);
        }
    }, [open, enable]);
    // Back from the form: focus returns to the button that opened it, inside the dialog.
    useEffect(() => {
        if (wasAdding.current && !adding) {
            addButton.current?.focus();
        }
        wasAdding.current = adding;
    }, [adding]);

    let body: React.ReactNode;
    if (adding) {
        body = <AddSourcePanel announce={announce} onDone={() => setAdding(false)} />;
    } else if (status === 'error' && sources === undefined) {
        body = <Banner severity="error" action={{ label: 'Retry', onClick: refresh }}>{`The sources could not be listed: ${error?.message ?? 'unknown error'}`}</Banner>;
    } else if (sources === undefined) {
        body = <p role="status">Loading sources…</p>;
    } else if (sources.length === 0) {
        body = <EmptyState message="No NuGet sources are configured." />;
    } else {
        body = <ul className="nuiget-source-list" aria-label="NuGet sources">{sources.map(source => <SourceRow key={source.name} source={source} announce={announce} />)}</ul>;
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={adding ? 'Add a NuGet source' : 'NuGet sources'}
            description={adding ? undefined : 'Sources of the selected project\'s config files. Remove deletes a source from the file that declares it.'}
            closeLabel="Close NuGet sources"
            data-testid="source-settings-modal"
            footer={adding ? undefined : <Button ref={addButton} onClick={() => setAdding(true)}>Add source</Button>}
        >
            {body}
        </Dialog>
    );
}
