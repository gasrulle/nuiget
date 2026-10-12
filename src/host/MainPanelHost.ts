/**
 * Main panel host: owns the `nUIget` WebviewPanel, registers the shared handlers and forwards
 * host-side events (session, invalidation, operations) to the webview. Navigation requests that
 * arrive before the webview is ready are queued and flushed on the first `session/get`.
 */

import * as vscode from 'vscode';
import type { InvalidationEvent } from '../core/contracts';
import type { EventPayload, EventType } from '../protocol';
import { registerSharedHandlers } from './handlers';
import { renderWebviewHtml, type HostServices } from './services';
import { WebviewHost } from './WebviewHost';

export class MainPanelHost extends WebviewHost {
    public static readonly viewType = 'nugetManager';
    private static current: MainPanelHost | undefined;

    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly pendingEvents: Array<{ type: EventType; payload: EventPayload<EventType> }> = [];
    private ready = false;

    /** Reveal the existing panel or create one. */
    public static createOrShow(services: HostServices, options?: { projectPath?: string; initialTab?: 'installed' | 'updates' }): MainPanelHost {
        const column = vscode.window.activeTextEditor?.viewColumn;
        if (MainPanelHost.current) {
            MainPanelHost.current.panel.reveal(column);
        } else {
            const panel = vscode.window.createWebviewPanel(MainPanelHost.viewType, 'nUIget', column ?? vscode.ViewColumn.One, {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [services.context.extensionUri],
            });
            MainPanelHost.current = new MainPanelHost(panel, services);
        }
        if (options?.projectPath) {
            void services.session.apply({ selectedProject: options.projectPath }, 'host');
            MainPanelHost.current.sendOrQueue('ui/selectProject', { projectPath: options.projectPath, initialTab: options.initialTab });
        }
        return MainPanelHost.current;
    }

    public static get instance(): MainPanelHost | undefined {
        return MainPanelHost.current;
    }

    /** Open the panel and navigate to a package (used by the sidebar's "View package details"). */
    public static navigateToPackage(services: HostServices, packageId: string, version?: string): void {
        MainPanelHost.createOrShow(services).sendOrQueue('ui/navigateToPackage', { packageId, version });
    }

    /** Open the panel with the source settings dialog visible. */
    public static openSourceSettings(services: HostServices): void {
        MainPanelHost.createOrShow(services).sendOrQueue('ui/openSourceSettings', {});
    }

    private constructor(panel: vscode.WebviewPanel, private readonly services: HostServices) {
        super('main', services.logger);
        this.panel = panel;
        this.attach(panel.webview);
        panel.iconPath = vscode.Uri.joinPath(services.context.extensionUri, 'resources', 'tab-icon.png');
        panel.webview.html = renderWebviewHtml(panel.webview, services.context.extensionUri, {
            script: 'webview.js',
            style: 'webview.css',
            rootId: 'root',
            title: 'nUIget',
        });

        registerSharedHandlers(this, services);
        this.on('ui/openSourceSettings', async () => { this.sendEvent('ui/openSourceSettings', {}); return {}; });
        this.on('ui/viewPackage', async ({ packageId, version }) => { this.sendEvent('ui/navigateToPackage', { packageId, version }); return {}; });
        const sessionGet = async () => {
            this.ready = true;
            this.flushPending();
            return services.session.snapshot;
        };
        this.on('session/get', sessionGet);

        panel.webview.onDidReceiveMessage(message => { void this.receive(message); }, null, this.disposables);
        panel.onDidDispose(() => this.dispose(), null, this.disposables);

        this.disposables.push(
            vscode.Disposable.from(services.session.onDidChange(snapshot => this.sendEvent('session/changed', snapshot))),
            services.onProjectsChanged(projects => this.sendEvent('projects/changed', { projects })),
            services.onOperationProgress(progress => this.sendEvent('ops/progress', progress)),
            services.onOperationCompleted(outcome => this.sendEvent('ops/completed', outcome)),
            services.onConfigChanged(config => this.sendEvent('config/changed', config)),
        );
    }

    /** Forward an invalidation to the webview. */
    /** The coordinator's event, forwarded as it is (ADR-002). */
    public notifyInvalidated(event: InvalidationEvent): void {
        this.sendEvent('resources/invalidated', event);
    }

    public notifySourceHealth(payload: EventPayload<'sources/health'>): void {
        this.sendEvent('sources/health', payload);
    }

    private sendOrQueue<T extends EventType>(type: T, payload: EventPayload<T>): void {
        if (this.ready) {
            this.sendEvent(type, payload);
        } else {
            this.pendingEvents.push({ type, payload });
        }
    }

    private flushPending(): void {
        const pending = this.pendingEvents.splice(0);
        // Let the webview finish its bootstrap requests before navigation events arrive.
        setTimeout(() => {
            for (const event of pending) {
                this.sendEvent(event.type, event.payload);
            }
        }, 150);
    }

    public dispose(): void {
        MainPanelHost.current = undefined;
        this.detach();
        for (const d of this.disposables.splice(0)) {
            d.dispose();
        }
        this.panel.dispose();
    }
}
