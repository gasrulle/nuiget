/**
 * Source settings overlay modal for managing NuGet sources.
 * Includes the source list, add source panel, and confirm remove dialog.
 */

import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { NuGetSource, VsCodeApi } from '../types';

interface SourceSettingsOverlayProps {
    sources: NuGetSource[];
    configFiles: { label: string; path: string }[];
    selectedConfigFile: string;
    onSelectedConfigFileChange: (path: string) => void;
    isWindows: boolean;
    togglingSource: string | null;
    removingSource: string | null;
    vscode: VsCodeApi;
    onClose: () => void;
    onToggleSource: (source: NuGetSource) => void;
    onRemoveSource: (name: string, configFile?: string) => void;
}

export interface SourceSettingsOverlayHandle {
    /** Handle addSourceResult message from backend */
    handleAddSourceResult: (success: boolean, error?: string) => void;
}

const SourceSettingsOverlay = forwardRef<SourceSettingsOverlayHandle, SourceSettingsOverlayProps>(
    function SourceSettingsOverlay(props, ref) {
        const {
            sources, configFiles, selectedConfigFile, onSelectedConfigFileChange,
            isWindows, togglingSource, removingSource, vscode, onClose,
            onToggleSource, onRemoveSource
        } = props;

        // Internal state for add source form
        const [showAddSourcePanel, setShowAddSourcePanel] = useState(false);
        const [addSourceUrl, setAddSourceUrl] = useState('');
        const [addSourceName, setAddSourceName] = useState('');
        const [addSourceUsername, setAddSourceUsername] = useState('');
        const [addSourcePassword, setAddSourcePassword] = useState('');
        const [storeEncrypted, setStoreEncrypted] = useState(isWindows);
        const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
        const [addSourceError, setAddSourceError] = useState<string | null>(null);
        const [addingSource, setAddingSource] = useState(false);
        const [confirmRemoveSource, setConfirmRemoveSource] = useState<{ name: string; configFile?: string } | null>(null);

        // Auto-clear confirm dialog when removingSource completes (goes null)
        useEffect(() => {
            if (!removingSource) {
                setConfirmRemoveSource(null);
            }
        }, [removingSource]);

        useImperativeHandle(ref, () => ({
            handleAddSourceResult(success: boolean, error?: string) {
                setAddingSource(false);
                if (success) {
                    // Reset form on success
                    setShowAddSourcePanel(false);
                    setAddSourceUrl('');
                    setAddSourceName('');
                    setAddSourceUsername('');
                    setAddSourcePassword('');
                    setStoreEncrypted(isWindows);
                    setAddSourceError(null);
                    setShowAdvancedOptions(false);
                } else if (error) {
                    setAddSourceError(error);
                }
            }
        }));

        const handleClose = () => {
            setShowAddSourcePanel(false);
            setConfirmRemoveSource(null);
            onClose();
        };

        return (
            <>
                {/* Source Settings Modal */}
                <div className="source-settings-overlay" onClick={handleClose}>
                    <div className="source-settings-modal" onClick={(e) => e.stopPropagation()}>
                        {/* Main Panel */}
                        <div className={`source-settings-main ${showAddSourcePanel ? 'slide-out' : ''}`}>
                            <div className="source-settings-header">
                                <h3>NuGet Sources</h3>
                                <button className="source-settings-close" onClick={handleClose}>✕</button>
                            </div>
                            <div className="source-settings-content">
                                {sources.length === 0 ? (
                                    <p className="empty-state">No NuGet sources configured.</p>
                                ) : (
                                    sources.map(source => (
                                        <div key={source.url} className="source-settings-item">
                                            <label className="source-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={source.enabled}
                                                    disabled={togglingSource === source.name || removingSource === source.name}
                                                    onChange={() => onToggleSource(source)}
                                                />
                                                <span className="toggle-slider"></span>
                                            </label>
                                            <div className="source-info">
                                                <span className={`source-name ${!source.enabled ? 'disabled' : ''}`}>
                                                    {source.name}
                                                    {togglingSource === source.name && <span className="toggling-indicator"> ⏳</span>}
                                                    {removingSource === source.name && <span className="toggling-indicator"> ⏳</span>}
                                                </span>
                                                <span className="source-url">{source.url}</span>
                                            </div>
                                            <button
                                                className="source-remove-btn"
                                                title="Remove from nearest config file"
                                                disabled={removingSource === source.name}
                                                onClick={() => setConfirmRemoveSource({ name: source.name, configFile: source.configFile })}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className="source-settings-footer">
                                <button
                                    className="btn btn-secondary add-source-btn"
                                    onClick={() => {
                                        setShowAddSourcePanel(true);
                                        setAddSourceError(null);
                                    }}
                                >
                                    + Add Source
                                </button>
                                <span className="source-settings-hint">Sources from all configs. Remove deletes from nearest config.</span>
                            </div>
                        </div>

                        {/* Add Source Panel (slides in) */}
                        <div className={`source-add-panel ${showAddSourcePanel ? 'slide-in' : ''}`}>
                            <div className="source-settings-header">
                                <button
                                    className="source-back-btn"
                                    onClick={() => {
                                        setShowAddSourcePanel(false);
                                        setAddSourceError(null);
                                    }}
                                >
                                    ← Back
                                </button>
                                <h3>Add New Source</h3>
                                <div style={{ width: '60px' }}></div>
                            </div>
                            <div className="source-add-content">
                                {configFiles.length > 0 && (
                                    <div className="form-group">
                                        <label>Add to config:</label>
                                        <select
                                            value={selectedConfigFile}
                                            onChange={(e) => onSelectedConfigFileChange((e.target as HTMLSelectElement).value)}
                                            className="config-select"
                                        >
                                            {configFiles.map(cf => (
                                                <option key={cf.path} value={cf.path}>{cf.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <div className="form-group">
                                    <label>URL *</label>
                                    <div className="input-with-warning">
                                        <input
                                            type="text"
                                            value={addSourceUrl}
                                            onChange={(e) => {
                                                setAddSourceUrl((e.target as HTMLInputElement).value);
                                                setAddSourceError(null);
                                            }}
                                            placeholder="https://api.nuget.org/v3/index.json"
                                            className={addSourceError ? 'input-error' : ''}
                                        />
                                        {addSourceUrl.startsWith('http://') && (
                                            <span className="http-warning" title="HTTP connections are insecure. HTTPS is recommended.">⚠️</span>
                                        )}
                                    </div>
                                    {addSourceError && (
                                        <span className="error-message">{addSourceError}</span>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label>Name (optional)</label>
                                    <input
                                        type="text"
                                        value={addSourceName}
                                        onChange={(e) => setAddSourceName((e.target as HTMLInputElement).value)}
                                        placeholder="Auto-generated from URL if empty"
                                    />
                                </div>
                                <div className="advanced-section">
                                    <button
                                        className="advanced-toggle"
                                        onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                                    >
                                        {showAdvancedOptions ? '▼' : '▶'} Advanced
                                    </button>
                                    {showAdvancedOptions && (
                                        <div className="advanced-content">
                                            <div className="form-group">
                                                <label>Username</label>
                                                <input
                                                    type="text"
                                                    value={addSourceUsername}
                                                    onChange={(e) => setAddSourceUsername((e.target as HTMLInputElement).value)}
                                                    placeholder="Optional"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Password</label>
                                                <input
                                                    type="password"
                                                    value={addSourcePassword}
                                                    onChange={(e) => setAddSourcePassword((e.target as HTMLInputElement).value)}
                                                    placeholder="Optional - supports %ENV_VAR% syntax"
                                                />
                                            </div>
                                            {addSourcePassword && (
                                                <div className="form-group">
                                                    <label className="preview-checkbox" title={isWindows ? 'Encrypt password using Windows DPAPI (same machine/user only)' : 'Password encryption is only available on Windows'}>
                                                        <input
                                                            type="checkbox"
                                                            checked={storeEncrypted}
                                                            onChange={(e) => setStoreEncrypted((e.target as HTMLInputElement).checked)}
                                                            disabled={!isWindows}
                                                        />
                                                        Store encrypted {!isWindows && '(Windows only)'}
                                                    </label>
                                                    {!storeEncrypted && isWindows && (
                                                        <span className="warning-text">⚠️ Password will be stored in clear text</span>
                                                    )}
                                                </div>
                                            )}
                                            <div className="security-info">
                                                <a href="https://learn.microsoft.com/en-us/nuget/consume-packages/consuming-packages-authenticated-feeds#security-best-practices-for-managing-credentials" target="_blank" rel="noopener noreferrer">Security best practices for credentials →</a>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="source-add-footer">
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        setShowAddSourcePanel(false);
                                        setAddSourceUrl('');
                                        setAddSourceName('');
                                        setAddSourceUsername('');
                                        setAddSourcePassword('');
                                        setStoreEncrypted(isWindows);
                                        setAddSourceError(null);
                                        setShowAdvancedOptions(false);
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-primary"
                                    disabled={!addSourceUrl.trim() || addingSource}
                                    onClick={() => {
                                        setAddingSource(true);
                                        setAddSourceError(null);
                                        vscode.postMessage({
                                            type: 'addSource',
                                            url: addSourceUrl.trim(),
                                            name: addSourceName.trim() || undefined,
                                            username: addSourceUsername.trim() || undefined,
                                            password: addSourcePassword || undefined,
                                            configFile: selectedConfigFile || undefined,
                                            allowInsecure: addSourceUrl.startsWith('http://'),
                                            storeEncrypted: addSourcePassword ? storeEncrypted : undefined
                                        });
                                    }}
                                >
                                    {addingSource ? 'Adding...' : 'Add Source'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Confirm Remove Source Dialog */}
                {confirmRemoveSource && (
                    <div className="source-settings-overlay" onClick={() => setConfirmRemoveSource(null)}>
                        <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                            <div className="confirm-dialog-header">
                                <h3>Remove Source</h3>
                            </div>
                            <div className="confirm-dialog-content">
                                <p>Are you sure you want to remove the source &ldquo;{confirmRemoveSource.name}&rdquo;?</p>
                                <p className="confirm-warning">This action cannot be undone.</p>
                            </div>
                            <div className="confirm-dialog-footer">
                                <button className="btn btn-secondary" onClick={() => setConfirmRemoveSource(null)}>
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-danger"
                                    onClick={() => {
                                        onRemoveSource(confirmRemoveSource.name, confirmRemoveSource.configFile);
                                        setConfirmRemoveSource(null);
                                    }}
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </>
        );
    }
);

export const MemoizedSourceSettingsOverlay = React.memo(SourceSettingsOverlay);
