/**
 * Benchmarks for .csproj XML parsing.
 * Tests parsing speed with varying numbers of PackageReferences.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, bench, describe, vi } from 'vitest';
import { NuGetProjectService } from '../../services/NuGetProjectService';

let tempDir: string;
let projectService: NuGetProjectService;
const csprojPaths: Record<string, string> = {};

function generateCsproj(packageCount: number): string {
    const refs = Array.from({ length: packageCount }, (_, i) =>
        `    <PackageReference Include="Package.${i}" Version="${Math.floor(i / 10)}.${i % 10}.0" />`,
    ).join('\n');

    return `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
${refs}
  </ItemGroup>
</Project>`;
}

beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuiget-bench-'));
    projectService = new NuGetProjectService(vi.fn(async () => false));

    for (const count of [5, 20, 50, 100]) {
        const filePath = path.join(tempDir, `project-${count}.csproj`);
        fs.writeFileSync(filePath, generateCsproj(count), 'utf-8');
        csprojPaths[count] = filePath;
    }

});

afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('.csproj parsing', () => {
    bench('5 PackageReferences', async () => {
        await projectService.getInstalledPackages(csprojPaths[5]);
    });

    bench('20 PackageReferences', async () => {
        await projectService.getInstalledPackages(csprojPaths[20]);
    });

    bench('50 PackageReferences', async () => {
        await projectService.getInstalledPackages(csprojPaths[50]);
    });

    bench('100 PackageReferences', async () => {
        await projectService.getInstalledPackages(csprojPaths[100]);
    });
});
