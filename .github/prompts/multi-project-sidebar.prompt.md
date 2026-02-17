# Multi-Project Collapsible Sidebar — Implementation Prompt

## Overview

Replace the **single-project selector** (QuickPick via title bar codicon) with **one collapsible section per project** in the sidebar. Each project section shows its installed packages and available updates inline. The search bar remains global at the top. This is a structural overhaul of the sidebar architecture.

## MANDATORY: Read These Files First

Before making ANY changes, read these files in full:
- `ARCHITECTURE.md` — System architecture, message protocol, state patterns, caching
- `.github/copilot-instructions.md` — Agent rules, gotchas, build verification requirements
- `src/webview/NuGetSidebarPanel.ts` — Backend WebviewViewProvider (all message handlers, background monitoring, cross-panel sync)
- `src/webview/sidebar/SidebarApp.tsx` — Main React component (state, message handler, render)
- `src/webview/sidebar/SidebarApp.css` — All sidebar styling
- `src/webview/sidebar/components/SectionHeader.tsx` — Reusable collapsible section header
- `src/webview/sidebar/components/PackageRow.tsx` — Package row with hover actions
- `src/webview/app/types.ts` — Shared TypeScript types
- `src/extension.ts` — Command registrations
- `package.json` — Extension manifest (commands, menus, views)

## Design Concept

### Current Architecture
- Title bar has a `$(project)` codicon → opens `showProjectPicker()` QuickPick
- A single `_selectedProject` controls which project's packages are shown
- Two collapsible sections: "Installed" and "Updates" (mutually exclusive accordion)
- "Load All Projects" toggle on Updates section switches to flat multi-project list
- Background monitoring (`checkUpdatesInBackground`) already discovers ALL projects and caches results in `_pendingProjectUpdates`

### New Architecture
- **Remove** the project selector codicon from the title bar
- **One `SectionHeader` per project** in default mode, sorted alphabetically
- Each section title = project name (without `.csproj` extension), with update count badge
- Clicking a section toggles it open/closed (multiple can be open simultaneously)
- Inside each section: installed packages listed first, then packages with updates (distinguished visually)
- **`activeProject`** replaces `selectedProject` — tracks which project is "focused" for browse/install operations
- Opening a section sets that project as `activeProject`
- Search (`@installed`, `@updates`, browse) works across `activeProject`
- Title bar "Update All" button updates ALL projects (existing `bulkUpdateAllProjects` logic)

---

## Step-by-Step Implementation

### Step 1: package.json — Remove selectProject command

Remove the `nuiget.sidebar.selectProject` command definition and all its menu references:

1. Remove the command object for `nuiget.sidebar.selectProject` from `contributes.commands`
2. Remove the `commandPalette` entry that hides it: `{ "command": "nuiget.sidebar.selectProject", "when": "false" }`
3. Remove the `view/title` entry: `{ "command": "nuiget.sidebar.selectProject", "when": "view == nuiget.sidebarView", "group": "navigation@2" }`
4. **Update navigation ordering**: After removing `@2`, bump the remaining title bar icons down:
   - `selectSource` → `navigation@2` (was `@3`)
   - `refresh` → `navigation@3` (was `@4`)
   - `openFullView` → `navigation@4` (was `@5`)

### Step 2: extension.ts — Remove selectProject registration

Remove the `vscode.commands.registerCommand('nuiget.sidebar.selectProject', ...)` line and its callback.

### Step 3: NuGetSidebarPanel.ts — Backend Changes

#### 3a. Remove `showProjectPicker()` method
Delete the entire `showProjectPicker()` method (~30 lines). It's no longer callable.

#### 3b. Rename `_selectedProject` → `_activeProject`
- Rename the field and all references
- It now represents the "focused" project for browse/install, not a singular selected project
- Keep the `workspaceState` key as `'nuget.selectedProject'` for backward compat

#### 3c. Add `projectPath` to all response messages
Ensure every response message from `_handleMessage` includes the `projectPath` it relates to, so the frontend knows which project section to update. Key messages to check:
- `installedPackages` — already has `projectPath` ✓
- `packageUpdatesMinimal` — already has `projectPath` ✓
- `installResult` — already has `projectPath` ✓
- `updateResult` — already has `projectPath` ✓
- `removeResult` — already has `projectPath` ✓
- `bulkUpdateResult` — already has `projectPath` ✓
- `searchResults` — does NOT need projectPath (browse is global)

#### 3d. Update `_sendInitialData()`
After sending projects list, **also send installed packages for ALL projects** (or at least send the `allProjectsUpdates` cache). The frontend needs per-project data to render all sections.

Current flow:
1. Auto-select first project if none selected
2. Send state (with `selectedProject`)
3. Send projects list
4. Send sources
5. Send cached `_pendingProjectUpdates`

New flow:
1. Send state (with `activeProject` — may be empty, that's fine)
2. Send projects list
3. Send sources
4. Send cached `_pendingProjectUpdates` (frontend uses this for update badges)
5. **Don't pre-fetch installed for all projects** — let the frontend lazy-load on section expand

#### 3e. Update `syncProject()`
Change to just update `_activeProject` and notify webview. Don't update title since the title bar no longer shows project name (or keep it if desired for the sidebar "NUIGET: ProjectName" format — decide based on preference).

#### 3f. Update `_updateTitle()`
Since there's no single project anymore, either:
- Option A: Remove project name from title, just show "nUIget" (set `this._view.title = undefined`)
- Option B: Show the `activeProject` name (keep current behavior)
Recommended: Option B — show the active project name so the user knows which project browse/install targets.

#### 3g. Handle `projectChanged` message differently
Currently `projectChanged` is sent when the QuickPick selects a project. In the new architecture, this message comes from the webview when the user clicks a section header. The backend should:
- Update `_activeProject`
- Save to `workspaceState`
- Sync to main panel (`NuGetPanel.syncProject`)
- Update title

### Step 4: SidebarApp.tsx — State Restructure

#### 4a. Replace single-project state with multi-project state

**Remove:**
```tsx
const [selectedProject, setSelectedProject] = useState('');
const [selectedProjectName, setSelectedProjectName] = useState('');
const [installedPackages, setInstalledPackages] = useState<InstalledPackage[]>([]);
const [packageUpdates, setPackageUpdates] = useState<PackageUpdateMinimal[]>([]);
const [expandedSection, setExpandedSection] = useState<'installed' | 'updates' | null>(null);
const [loadAllProjects, setLoadAllProjects] = useState(false);
const [backgroundInstalledCount, setBackgroundInstalledCount] = useState(0);
const [loadingInstalled, setLoadingInstalled] = useState(false);
const [loadingUpdates, setLoadingUpdates] = useState(false);
const [loadingAllUpdates, setLoadingAllUpdates] = useState(false);
```

**Add:**
```tsx
// Which projects are expanded (multiple can be open)
const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

// Per-project installed packages cache
const [projectPackages, setProjectPackages] = useState<Map<string, InstalledPackage[]>>(new Map());

// Which projects are currently loading installed packages
const [loadingProjectPackages, setLoadingProjectPackages] = useState<Set<string>>(new Set());

// The "active" project for browse/install operations
const [activeProject, setActiveProject] = useState('');
```

Keep:
- `allProjectsUpdates` — still provides update data per project
- `loadingAllUpdates` — for initial background check
- `searchResults`, `loadingSearch` — browse is still global

#### 4b. Add refs for new state
```tsx
const expandedProjectsRef = useRef(expandedProjects);
const projectPackagesRef = useRef(projectPackages);
const loadingProjectPackagesRef = useRef(loadingProjectPackages);
const activeProjectRef = useRef(activeProject);
```

Keep them in sync with `useEffect` like existing refs.

**CRITICAL**: When updating `Set` and `Map` state, always create new instances:
```tsx
setExpandedProjects(prev => {
    const next = new Set(prev);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    return next;
});
```

### Step 5: Message Handler Updates

#### 5a. `installedPackages` handler
Instead of setting a global `installedPackages`, update the per-project map:
```tsx
case 'installedPackages': {
    const pkgs = (message.packages || []) as InstalledPackage[];
    const projPath = message.projectPath as string;
    setProjectPackages(prev => {
        const next = new Map(prev);
        next.set(projPath, pkgs);
        return next;
    });
    setLoadingProjectPackages(prev => {
        const next = new Set(prev);
        next.delete(projPath);
        return next;
    });
    // Also check for updates for this project if we don't have them
    const bgData = allProjectsUpdatesRef.current.find(pu => pu.projectPath === projPath);
    if (!bgData && pkgs.length > 0) {
        vscode.postMessage({
            type: 'checkPackageUpdates',
            installedPackages: pkgs,
            includePrerelease: includePrereleaseRef.current,
            projectPath: projPath
        });
    }
    break;
}
```

#### 5b. `packageUpdatesMinimal` handler
Update `allProjectsUpdates` for the specific project:
```tsx
case 'packageUpdatesMinimal': {
    const updates = message.updates || [];
    const projPath = message.projectPath as string;
    setAllProjectsUpdates(prev => {
        const next = prev.filter(pu => pu.projectPath !== projPath);
        if (updates.length > 0) {
            const project = projects.find(p => p.path === projPath);
            next.push({
                projectPath: projPath,
                projectName: project?.name || projPath.split(/[\\/]/).pop() || '',
                updates
            });
        }
        return next;
    });
    break;
}
```

#### 5c. `state` handler
Replace `selectedProject` with `activeProject`:
```tsx
case 'state':
    if (message.selectedSource) setSelectedSource(message.selectedSource);
    if (message.selectedProject) setActiveProject(message.selectedProject);
    if (message.includePrerelease !== undefined) setIncludePrerelease(message.includePrerelease);
    break;
```

#### 5d. Operation result handlers (`installResult`, `updateResult`, `removeResult`, `bulkUpdateResult`, `bulkUpdateAllProjectsResult`)
Clear the affected project's cached packages and re-fetch:
```tsx
case 'installResult':
case 'updateResult':
case 'removeResult': {
    const projPath = message.projectPath as string;
    // Clear cached packages for this project
    setProjectPackages(prev => {
        const next = new Map(prev);
        next.delete(projPath);
        return next;
    });
    // Re-fetch installed for this project if its section is expanded
    if (expandedProjectsRef.current.has(projPath)) {
        vscode.postMessage({ type: 'getInstalledPackages', projectPath: projPath });
        setLoadingProjectPackages(prev => {
            const next = new Set(prev);
            next.add(projPath);
            return next;
        });
    }
    // Clear and re-fetch updates
    setAllProjectsUpdates([]);
    allProjectsUpdatesRef.current = [];
    vscode.postMessage({
        type: 'checkAllProjectsUpdates',
        includePrerelease: includePrereleaseRef.current
    });
    break;
}

case 'bulkUpdateResult':
case 'bulkUpdateAllProjectsResult':
    // Clear all project caches
    setProjectPackages(new Map());
    setAllProjectsUpdates([]);
    allProjectsUpdatesRef.current = [];
    // Re-fetch for all expanded projects
    for (const projPath of expandedProjectsRef.current) {
        vscode.postMessage({ type: 'getInstalledPackages', projectPath: projPath });
        setLoadingProjectPackages(prev => {
            const next = new Set(prev);
            next.add(projPath);
            return next;
        });
    }
    vscode.postMessage({
        type: 'checkAllProjectsUpdates',
        includePrerelease: includePrereleaseRef.current
    });
    break;
```

#### 5e. Remove `projectChanged` handler
No longer needed — project selection happens within the webview now, not via external command.

#### 5f. `forceRefresh` handler
Clear ALL project caches and re-fetch for expanded projects:
```tsx
case 'forceRefresh':
    setProjectPackages(new Map());
    setAllProjectsUpdates([]);
    allProjectsUpdatesRef.current = [];
    for (const projPath of expandedProjectsRef.current) {
        vscode.postMessage({ type: 'getInstalledPackages', projectPath: projPath });
        setLoadingProjectPackages(prev => {
            const next = new Set(prev);
            next.add(projPath);
            return next;
        });
    }
    break;
```

### Step 6: Section Toggle & Lazy Loading

```tsx
const toggleProject = useCallback((projectPath: string) => {
    setExpandedProjects(prev => {
        const next = new Set(prev);
        if (next.has(projectPath)) {
            next.delete(projectPath);
        } else {
            next.add(projectPath);
        }
        return next;
    });
    // Set as active project when expanding
    setActiveProject(projectPath);
    // Notify backend of active project change
    vscode.postMessage({ type: 'setActiveProject', projectPath });
    setSelectedPackageId(null);
}, []);
```

Add a `useEffect` for lazy loading installed packages when a section expands:
```tsx
useEffect(() => {
    for (const projPath of expandedProjects) {
        if (!projectPackages.has(projPath) && !loadingProjectPackages.has(projPath)) {
            vscode.postMessage({ type: 'getInstalledPackages', projectPath: projPath });
            setLoadingProjectPackages(prev => {
                const next = new Set(prev);
                next.add(projPath);
                return next;
            });
        }
    }
}, [expandedProjects, projectPackages, loadingProjectPackages]);
```

### Step 7: Default Mode Rendering — Per-Project Sections

Replace the current dual-section rendering with a per-project loop:

```tsx
{searchMode === 'default' && (
    <>
        {[...projects].sort((a, b) => a.name.localeCompare(b.name)).map((project) => {
            const isExpanded = expandedProjects.has(project.path);
            const projectUpdates = allProjectsUpdates.find(pu => pu.projectPath === project.path);
            const updateCount = projectUpdates?.updates.length ?? 0;
            const installed = projectPackages.get(project.path) || [];
            const isLoading = loadingProjectPackages.has(project.path);
            const displayName = project.name.replace(/\.(csproj|fsproj|vbproj)$/, '');

            return (
                <React.Fragment key={project.path}>
                    <SectionHeader
                        title={displayName}
                        expanded={isExpanded}
                        count={updateCount}
                        loading={isLoading}
                        onToggle={() => toggleProject(project.path)}
                        actions={updateCount > 0 ? (
                            <button
                                className="section-action-btn"
                                onClick={(e) => { e.stopPropagation(); handleProjectUpdateAll(project.path); }}
                                title={`Update all (${updateCount})`}
                            >
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M8 1l-4.5 6H7v6h2V7h3.5L8 1z" />
                                </svg>
                            </button>
                        ) : undefined}
                    />
                    {isExpanded && renderProjectPackages(project.path, installed, projectUpdates)}
                </React.Fragment>
            );
        })}
    </>
)}
```

### Step 8: `renderProjectPackages` — Merged Installed + Updates

Create a new render helper that shows installed packages, with update indicators inline:

```tsx
const renderProjectPackages = (projectPath: string, installed: InstalledPackage[], projectUpdates: ProjectUpdates | undefined) => {
    const updateMap = new Map<string, PackageUpdateMinimal>();
    if (projectUpdates) {
        for (const u of projectUpdates.updates) {
            updateMap.set(u.id.toLowerCase(), u);
        }
    }
    const isLoading = loadingProjectPackages.has(projectPath);

    return (
        <div className="section-content" role="listbox" tabIndex={0}>
            {isLoading && installed.length === 0 && (
                <div className="sidebar-empty">Loading...</div>
            )}
            {!isLoading && installed.length === 0 && (
                <div className="sidebar-empty">No packages installed.</div>
            )}
            {installed.map(pkg => {
                const update = updateMap.get(pkg.id.toLowerCase());
                return (
                    <PackageRow
                        key={pkg.id}
                        packageId={pkg.id}
                        version={pkg.resolvedVersion || pkg.version}
                        latestVersion={update?.latestVersion}
                        installedVersion={pkg.resolvedVersion || pkg.version}
                        context={update ? 'updates' : 'installed'}
                        selected={selectedPackageId === pkg.id}
                        onPrimaryAction={update
                            ? (id) => handleProjectPackageUpdate(projectPath, id, update.latestVersion)
                            : (id) => handleProjectPackageRemove(projectPath, id)
                        }
                        onContextMenu={(id, e) => handleContextMenu(id, e, update ? 'updates' : 'installed', projectPath)}
                        onClick={(id) => setSelectedPackageId(id)}
                    />
                );
            })}
        </div>
    );
};
```

### Step 9: Per-Project Action Handlers

```tsx
const handleProjectPackageUpdate = useCallback((projectPath: string, packageId: string, version: string) => {
    vscode.postMessage({
        type: 'updatePackage',
        projectPath,
        packageId,
        version
    });
}, []);

const handleProjectPackageRemove = useCallback((projectPath: string, packageId: string) => {
    vscode.postMessage({
        type: 'removePackage',
        projectPath,
        packageId
    });
}, []);

const handleProjectUpdateAll = useCallback((projectPath: string) => {
    const projectUpdate = allProjectsUpdatesRef.current.find(pu => pu.projectPath === projectPath);
    if (!projectUpdate || projectUpdate.updates.length === 0) return;
    vscode.postMessage({
        type: 'bulkUpdatePackages',
        packages: projectUpdate.updates.map(u => ({ id: u.id, version: u.latestVersion })),
        projectPath
    });
}, []);
```

### Step 10: `@installed` / `@updates` Search Modes

These modes should now show results across ALL projects (or just the active project — design choice).

**Recommended approach**: Show across all projects, grouped by project name (like the current "Load All Projects" mode).

For `@installed`:
```tsx
{searchMode === 'installed' && (
    <div className="section-content">
        {[...projects].sort((a, b) => a.name.localeCompare(b.name)).map(project => {
            const installed = projectPackages.get(project.path) || [];
            const filtered = installed.filter(p =>
                p.id.toLowerCase().includes(filterText.toLowerCase())
            );
            if (filtered.length === 0) return null;
            const displayName = project.name.replace(/\.(csproj|fsproj|vbproj)$/, '');
            return (
                <div key={project.path}>
                    <div className="project-group-header" title={project.path}>
                        {displayName} ({filtered.length})
                    </div>
                    {filtered.map(pkg => (
                        <PackageRow key={`${project.path}::${pkg.id}`} ... />
                    ))}
                </div>
            );
        })}
    </div>
)}
```

For `@updates`, similarly iterate `allProjectsUpdates`.

**Note**: For `@installed` to show all projects, installed packages must be fetched for all projects. Trigger a fetch for all projects when entering `@installed` mode if not cached:
```tsx
useEffect(() => {
    if (searchMode === 'installed' || searchMode === 'updates') {
        for (const project of projects) {
            if (!projectPackages.has(project.path) && !loadingProjectPackages.has(project.path)) {
                vscode.postMessage({ type: 'getInstalledPackages', projectPath: project.path });
                setLoadingProjectPackages(prev => {
                    const next = new Set(prev);
                    next.add(project.path);
                    return next;
                });
            }
        }
    }
}, [searchMode, projects, projectPackages, loadingProjectPackages]);
```

### Step 11: Browse Mode — Install Target

When the user browses and clicks "Install", the package should be installed into the `activeProject`. The current `selectedProjectRef` pattern maps directly to `activeProjectRef`.

- If `activeProject` is empty when the user tries to install, show a warning (or auto-select the first project).
- The "Install" action from PackageRow should use `activeProjectRef.current`.

### Step 12: `handleUpdateAll` — Global Update All

The title bar "Update All" should update ALL projects:
```tsx
const handleUpdateAll = useCallback(() => {
    const projectUpdatesPayload = allProjectsUpdatesRef.current.map(pu => ({
        projectPath: pu.projectPath,
        projectName: pu.projectName,
        packages: pu.updates.map(u => ({ id: u.id, version: u.latestVersion }))
    }));
    if (projectUpdatesPayload.length === 0) return;
    vscode.postMessage({
        type: 'bulkUpdateAllProjects',
        projectUpdates: projectUpdatesPayload
    });
}, []);
```

### Step 13: NuGetSidebarPanel — Handle `setActiveProject` message

Add a new message case:
```typescript
case 'setActiveProject': {
    const projectPath = data.projectPath as string;
    this._activeProject = projectPath;
    this._context.workspaceState.update('nuget.selectedProject', projectPath);
    this._updateTitle();
    NuGetPanel.syncProject(projectPath);
    break;
}
```

### Step 14: CSS Changes

#### Remove `max-height` from `.section-content`
Currently `max-height: 500px` limits each section. With multiple project sections, remove this limit and let the sidebar's own scrollbar handle it:
```css
.section-content {
    overflow-y: visible; /* or remove overflow-y entirely */
    /* Remove max-height: 500px */
}
```

The sidebar's `#sidebar-root` already has `min-height: 100vh` and the webview container handles scrolling.

#### Keep existing styles
All other styles (`.section-header`, `.package-row`, `.project-group-header`, etc.) work as-is.

### Step 15: Cross-Panel Sync Cleanup

- Remove `syncProject()` calls triggered by external QuickPick (that code path is removed)
- Keep `syncProject()` for the reverse direction: when main panel changes project, sidebar should update `activeProject` and possibly auto-expand that section
- The `projectChanged` message handler in the webview should:
  - Set `activeProject`
  - Auto-expand that project's section
  - Scroll it into view

### Step 16: Update Documentation

After implementation:
1. **CHANGELOG.md** — Add under `## [Unreleased]` → `### Changed`:
   - `- **Multi-project sidebar sections**`
2. **ARCHITECTURE.md** — Update sidebar section to describe per-project sections, `expandedProjects` Set, `projectPackages` Map, lazy loading, `activeProject`, `setActiveProject` message
3. **copilot-instructions.md** — Add any new gotchas discovered during implementation

---

## Edge Cases & Important Notes

1. **Single-project workspaces**: Only one section shows. Automatically expand it on first load.
2. **Empty workspace**: Show "No .NET projects found" (existing welcome state).
3. **Background check data**: `checkUpdatesInBackground` already discovers all projects. Its `allProjectsUpdates` data provides badge counts for every section before any section is expanded.
4. **Project added/removed at runtime**: The `.csproj` file watcher triggers `forceRefresh` → re-send projects list → frontend rebuilds sections.
5. **Stale closure prevention**: All state read inside `useCallback([])` must use `useRef` mirrors. New refs needed: `expandedProjectsRef`, `projectPackagesRef`, `loadingProjectPackagesRef`, `activeProjectRef`.
6. **React StrictMode**: Never call `postMessage()` inside `setState()` updaters. Use flag variables.
7. **Immutable state updates**: Always create new `Set`/`Map` instances — React won't detect mutations.
8. **Build verification**: Run `npm run package:vsix` after changes to catch TypeScript errors.
9. **`loadAllProjects` toggle removal**: The "All Projects / Selected Project" toggle button on the Updates section header is no longer needed — all projects are always visible. Remove the toggle state and button.
10. **`backgroundInstalledCount` removal**: No longer needed — each section shows its own installed count from `projectPackages.get(path)?.length`.
11. **Keyboard navigation**: `createSidebarKeyHandler` may need adjustment to work within per-project section containers rather than a global list.
12. **Main panel sync**: When main panel changes project, send `projectChanged` to sidebar → sidebar sets `activeProject` and auto-expands that section.
