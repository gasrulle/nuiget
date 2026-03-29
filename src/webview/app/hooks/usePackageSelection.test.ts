import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePackageSelection, UsePackageSelectionDeps } from './usePackageSelection';

function createMockDeps(overrides: Partial<UsePackageSelectionDeps<{ id: string }>> = {}): UsePackageSelectionDeps<{ id: string }> {
    const mockVersionsCache = { get: vi.fn(), set: vi.fn() };
    const mockMetadataCache = { get: vi.fn(), set: vi.fn() };

    return {
        setSelectedPackage: vi.fn(),
        setSelectedTransitivePackage: vi.fn(),
        setSelectedVersion: vi.fn(),
        setDetailsTab: vi.fn(),
        setExpandedDeps: vi.fn(),
        setPackageVersions: vi.fn(),
        setLoadingVersions: vi.fn(),
        setPackageMetadata: vi.fn(),
        setLoadingMetadata: vi.fn(),
        versionsCache: { current: mockVersionsCache },
        metadataCache: { current: mockMetadataCache },
        selectedSource: 'all',
        includePrerelease: false,
        selectedPackage: null,
        vscode: { postMessage: vi.fn(), getState: vi.fn(), setState: vi.fn() },
        ...overrides,
    };
}

describe('usePackageSelection', () => {
    describe('selectDirectPackage', () => {
        it('selects package and clears transitive', () => {
            const deps = createMockDeps();
            const { result } = renderHook(() => usePackageSelection(deps));

            act(() => {
                result.current.selectDirectPackage(
                    { id: 'Pkg' },
                    { selectedVersionValue: '1.0', metadataVersion: '1.0', initialVersions: ['1.0'] }
                );
            });

            expect(deps.setSelectedPackage).toHaveBeenCalledWith({ id: 'Pkg' });
            expect(deps.setSelectedTransitivePackage).toHaveBeenCalledWith(null);
            expect(deps.setSelectedVersion).toHaveBeenCalledWith('1.0');
            expect(deps.setDetailsTab).toHaveBeenCalledWith('details');
            expect(deps.setExpandedDeps).toHaveBeenCalledWith(new Set());
        });

        it('returns true when selection performed', () => {
            const deps = createMockDeps();
            const { result } = renderHook(() => usePackageSelection(deps));

            let returned = false;
            act(() => {
                returned = result.current.selectDirectPackage(
                    { id: 'Pkg' },
                    { selectedVersionValue: '1.0', metadataVersion: '1.0', initialVersions: ['1.0'] }
                );
            });
            expect(returned).toBe(true);
        });

        it('skips if same package already selected (case-insensitive)', () => {
            const deps = createMockDeps({ selectedPackage: { id: 'pkg' } });
            const { result } = renderHook(() => usePackageSelection(deps));

            let returned = false;
            act(() => {
                returned = result.current.selectDirectPackage(
                    { id: 'PKG' },
                    { selectedVersionValue: '1.0', metadataVersion: '1.0', initialVersions: ['1.0'] }
                );
            });
            expect(returned).toBe(false);
            expect(deps.setSelectedPackage).not.toHaveBeenCalled();
        });

        it('does not skip when skipIfSelected=false', () => {
            const deps = createMockDeps({ selectedPackage: { id: 'Pkg' } });
            const { result } = renderHook(() => usePackageSelection(deps));

            let returned = false;
            act(() => {
                returned = result.current.selectDirectPackage(
                    { id: 'Pkg' },
                    { selectedVersionValue: '1.0', metadataVersion: '1.0', initialVersions: ['1.0'] },
                    false
                );
            });
            expect(returned).toBe(true);
            expect(deps.setSelectedPackage).toHaveBeenCalled();
        });

        it('uses cached versions when available', () => {
            const deps = createMockDeps();
            (deps.versionsCache.current as any).get.mockReturnValue(['1.0', '2.0']);
            const { result } = renderHook(() => usePackageSelection(deps));

            act(() => {
                result.current.selectDirectPackage(
                    { id: 'Pkg' },
                    { selectedVersionValue: '1.0', metadataVersion: '1.0', initialVersions: ['1.0'] }
                );
            });

            expect(deps.setPackageVersions).toHaveBeenCalledWith(['1.0', '2.0']);
            expect(deps.setLoadingVersions).toHaveBeenCalledWith(false);
            expect(deps.vscode.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'getPackageVersions' }));
        });

        it('fetches versions when not cached', () => {
            const deps = createMockDeps();
            (deps.versionsCache.current as any).get.mockReturnValue(undefined);
            const { result } = renderHook(() => usePackageSelection(deps));

            act(() => {
                result.current.selectDirectPackage(
                    { id: 'Pkg' },
                    { selectedVersionValue: '1.0', metadataVersion: '1.0', initialVersions: ['1.0'] }
                );
            });

            expect(deps.setPackageVersions).toHaveBeenCalledWith(['1.0']); // initial versions
            expect(deps.setLoadingVersions).toHaveBeenCalledWith(true);
            expect(deps.vscode.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'getPackageVersions', packageId: 'Pkg'
            }));
        });

        it('uses cached metadata when available', () => {
            const deps = createMockDeps();
            const cachedMeta = { id: 'Pkg', version: '1.0', description: 'test', authors: 'a', dependencies: [] };
            (deps.metadataCache.current as any).get.mockReturnValue(cachedMeta);
            const { result } = renderHook(() => usePackageSelection(deps));

            act(() => {
                result.current.selectDirectPackage(
                    { id: 'Pkg' },
                    { selectedVersionValue: '1.0', metadataVersion: '1.0', initialVersions: ['1.0'] }
                );
            });

            expect(deps.setPackageMetadata).toHaveBeenCalledWith(cachedMeta);
            expect(deps.setLoadingMetadata).toHaveBeenCalledWith(false);
        });

        it('fetches metadata when not cached', () => {
            const deps = createMockDeps();
            const { result } = renderHook(() => usePackageSelection(deps));

            act(() => {
                result.current.selectDirectPackage(
                    { id: 'Pkg' },
                    { selectedVersionValue: '2.0', metadataVersion: '2.0', initialVersions: ['2.0'] }
                );
            });

            expect(deps.setPackageMetadata).toHaveBeenCalledWith(null);
            expect(deps.setLoadingMetadata).toHaveBeenCalledWith(true);
            expect(deps.vscode.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'getPackageMetadata', packageId: 'Pkg', version: '2.0'
            }));
        });

        it('passes source filter when not "all"', () => {
            const deps = createMockDeps({ selectedSource: 'https://custom.feed' });
            const { result } = renderHook(() => usePackageSelection(deps));

            act(() => {
                result.current.selectDirectPackage(
                    { id: 'Pkg' },
                    { selectedVersionValue: '1.0', metadataVersion: '1.0', initialVersions: ['1.0'] }
                );
            });

            expect(deps.vscode.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                source: 'https://custom.feed'
            }));
        });

        it('omits source when "all"', () => {
            const deps = createMockDeps({ selectedSource: 'all' });
            const { result } = renderHook(() => usePackageSelection(deps));

            act(() => {
                result.current.selectDirectPackage(
                    { id: 'Pkg' },
                    { selectedVersionValue: '1.0', metadataVersion: '1.0', initialVersions: ['1.0'] }
                );
            });

            const versionMsg = (deps.vscode.postMessage as ReturnType<typeof vi.fn>).mock.calls.find(
                (c: unknown[]) => (c[0] as Record<string, unknown>).type === 'getPackageVersions'
            );
            expect(versionMsg![0]).toHaveProperty('source', undefined);
        });
    });

    describe('selectTransitivePackage', () => {
        it('sets transitive and clears direct', () => {
            const deps = createMockDeps();
            const { result } = renderHook(() => usePackageSelection(deps));
            const transPkg = { id: 'TransPkg', version: '1.0', requiredByChain: ['A'] };

            act(() => {
                result.current.selectTransitivePackage(transPkg);
            });

            expect(deps.setSelectedTransitivePackage).toHaveBeenCalledWith(transPkg);
            expect(deps.setSelectedPackage).toHaveBeenCalledWith(null);
        });
    });

    describe('clearSelection', () => {
        it('clears both direct and transitive', () => {
            const deps = createMockDeps();
            const { result } = renderHook(() => usePackageSelection(deps));

            act(() => {
                result.current.clearSelection();
            });

            expect(deps.setSelectedPackage).toHaveBeenCalledWith(null);
            expect(deps.setSelectedTransitivePackage).toHaveBeenCalledWith(null);
        });
    });
});
