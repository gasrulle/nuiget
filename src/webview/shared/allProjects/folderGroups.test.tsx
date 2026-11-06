import { describe, expect, it } from 'vitest';
import { groupByFolder, PROJECT_GROUP, projectGroupIds } from './folderGroups';

const project = (projectPath: string, projectName: string, workspaceFolder?: string) => ({ projectPath, projectName, workspaceFolder });

describe('All Projects grouping (UX-P3.1b)', () => {
    it('groups by workspace folder in the order the folders first appear; a project without one is under Other', () => {
        const items = [project('/a/App.csproj', 'App.csproj', 'app'), project('/t/Tool.csproj', 'Tool.csproj', 'tools'), project('/a/Lib.csproj', 'Lib.csproj', 'app'), project('/x/Loose.csproj', 'Loose.csproj')];
        expect(groupByFolder(items).map(([folder, members]) => [folder, members.map(member => member.projectName)])).toEqual([
            ['app', ['App.csproj', 'Lib.csproj']],
            ['tools', ['Tool.csproj']],
            ['Other', ['Loose.csproj']],
        ]);
    });

    it('names a project\'s group row after its lower-cased name when it is unique', () => {
        const ids = projectGroupIds([project('/w/App.csproj', 'App.csproj', 'w'), project('/w/Lib.csproj', 'Lib.csproj', 'w')]);
        expect([...ids]).toEqual([['/w/App.csproj', 'project-app.csproj'], ['/w/Lib.csproj', 'project-lib.csproj']]);
        expect(PROJECT_GROUP).toBe('project-');
    });

    it('adds the folder to a name two folders share, and falls back to the path for the same name twice in one folder', () => {
        const twoFolders = projectGroupIds([project('/a/App.csproj', 'App.csproj', 'app'), project('/b/App.csproj', 'App.csproj', 'tools')]);
        expect(twoFolders.get('/a/App.csproj')).toBe('project-app.csproj');
        expect(twoFolders.get('/b/App.csproj')).toBe('project-tools/app.csproj');
        const oneFolder = projectGroupIds([project('/w/a/App.csproj', 'App.csproj', 'w'), project('/w/b/App.csproj', 'App.csproj', 'w'), project('/w/c/App.csproj', 'App.csproj', 'w')]);
        expect(oneFolder.get('/w/a/App.csproj')).toBe('project-app.csproj');
        expect(oneFolder.get('/w/b/App.csproj')).toBe('project-w/app.csproj');
        expect(oneFolder.get('/w/c/App.csproj')).toBe('project-/w/c/app.csproj');
    });

    it('with a single folder uses the project\'s own folder in the second form', () => {
        const ids = projectGroupIds([project('/w/a/App.csproj', 'App.csproj', 'w'), project('/w/b/App.csproj', 'App.csproj', 'w')]);
        expect(new Set(ids.values()).size).toBe(2);
        expect(ids.get('/w/b/App.csproj')).toBe('project-w/app.csproj');
    });
});
