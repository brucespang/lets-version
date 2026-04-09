import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getAllPackagesChangedBasedOnFilesModified } from '../getPackages.js';
import { listPackages } from '../lets-version.js';
import { PackageInfo } from '../types.js';
import { isUnderPath } from '../util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('isUnderPath', () => {
  it('should match files directly inside the base path', () => {
    expect(isUnderPath('/repo/src/file.ts', '/repo/src')).toBe(true);
  });

  it('should match files in nested subdirectories', () => {
    expect(isUnderPath('/repo/src/deep/nested/file.ts', '/repo/src')).toBe(true);
  });

  it('should not match paths that share a prefix but differ at a directory boundary', () => {
    expect(isUnderPath('/repo/src-other/file.ts', '/repo/src')).toBe(false);
  });

  it('should handle base paths with trailing separators', () => {
    expect(isUnderPath('/repo/src/file.ts', '/repo/src/')).toBe(true);
  });

  it('should match when filePath equals basePath exactly', () => {
    expect(isUnderPath('/repo/src', '/repo/src')).toBe(true);
  });

  it('should not match unrelated paths', () => {
    expect(isUnderPath('/other/path/file.ts', '/repo/src')).toBe(false);
  });
});

describe('additionalPaths support', () => {
  const projectPath = path.join(__dirname, './dummyProjects/multiNPMWithAdditionalPaths');

  it('should read additionalPaths from letsVersion.config.mjs and populate allPaths', async () => {
    const packages = await listPackages({ cwd: projectPath });

    const wasmPkg = packages.find(p => p.name === 'wasm-pkg');
    const anotherWasmPkg = packages.find(p => p.name === 'another-wasm-pkg');
    const regularPkg = packages.find(p => p.name === 'regular-pkg');

    expect(wasmPkg).toBeDefined();
    expect(anotherWasmPkg).toBeDefined();
    expect(regularPkg).toBeDefined();

    const expectedExternalPath = path.resolve(projectPath, 'external-src');

    expect(wasmPkg!.additionalPaths).toEqual([expectedExternalPath]);
    expect(wasmPkg!.allPaths).toEqual([wasmPkg!.packagePath, expectedExternalPath]);

    expect(anotherWasmPkg!.additionalPaths).toEqual([expectedExternalPath]);
    expect(anotherWasmPkg!.allPaths).toEqual([anotherWasmPkg!.packagePath, expectedExternalPath]);

    expect(regularPkg!.additionalPaths).toEqual([]);
    expect(regularPkg!.allPaths).toEqual([regularPkg!.packagePath]);
  });

  it('should detect changed packages when files in additionalPaths are modified', async () => {
    const packages = await listPackages({ cwd: projectPath });
    const externalFilePath = path.resolve(projectPath, 'external-src/main.c');

    const changedPackages = await getAllPackagesChangedBasedOnFilesModified([externalFilePath], packages, projectPath);

    const changedNames = changedPackages.map(p => p.name).sort();
    expect(changedNames).toEqual(['another-wasm-pkg', 'wasm-pkg']);
    for (const pkg of changedPackages) {
      expect(pkg.filesChanged).toContain(externalFilePath);
    }
  });

  it('should not attribute external file changes to packages without additionalPaths', async () => {
    const packages = await listPackages({ cwd: projectPath });
    const externalFilePath = path.resolve(projectPath, 'external-src/main.c');

    const changedPackages = await getAllPackagesChangedBasedOnFilesModified([externalFilePath], packages, projectPath);

    const regularPkg = changedPackages.find(p => p.name === 'regular-pkg');
    expect(regularPkg).toBeUndefined();
  });

  it('should still detect changes to files within the package directory itself', async () => {
    const packages = await listPackages({ cwd: projectPath });
    const wasmPkg = packages.find(p => p.name === 'wasm-pkg')!;
    const internalFilePath = path.join(wasmPkg.packagePath, 'src/index.ts');

    const changedPackages = await getAllPackagesChangedBasedOnFilesModified([internalFilePath], packages, projectPath);

    expect(changedPackages.length).toBe(1);
    expect(changedPackages[0]!.name).toBe('wasm-pkg');
  });

  it('should handle both internal and external file changes for the same package', async () => {
    const packages = await listPackages({ cwd: projectPath });
    const wasmPkg = packages.find(p => p.name === 'wasm-pkg')!;
    const internalFilePath = path.join(wasmPkg.packagePath, 'src/index.ts');
    const externalFilePath = path.resolve(projectPath, 'external-src/main.c');

    const changedPackages = await getAllPackagesChangedBasedOnFilesModified(
      [internalFilePath, externalFilePath],
      packages,
      projectPath,
    );

    const wasmChanged = changedPackages.find(p => p.name === 'wasm-pkg');
    expect(wasmChanged).toBeDefined();
    expect(wasmChanged!.filesChanged).toContain(internalFilePath);
    expect(wasmChanged!.filesChanged).toContain(externalFilePath);

    const anotherChanged = changedPackages.find(p => p.name === 'another-wasm-pkg');
    expect(anotherChanged).toBeDefined();
    expect(anotherChanged!.filesChanged).toContain(externalFilePath);
    expect(anotherChanged!.filesChanged).not.toContain(internalFilePath);
  });

  it('should bump multiple packages that share the same additionalPath', async () => {
    const packages = await listPackages({ cwd: projectPath });
    const externalFilePath = path.resolve(projectPath, 'external-src/main.c');

    const changedPackages = await getAllPackagesChangedBasedOnFilesModified([externalFilePath], packages, projectPath);

    const changedNames = changedPackages.map(p => p.name).sort();
    expect(changedNames).toEqual(['another-wasm-pkg', 'wasm-pkg']);
    expect(changedPackages.find(p => p.name === 'regular-pkg')).toBeUndefined();
  });

  it('should default allPaths to [packagePath] when no additionalPaths configured', () => {
    const pkg = new PackageInfo({
      isPrivate: false,
      name: 'test-pkg',
      packagePath: '/some/path',
      packageJSONPath: '/some/path/package.json',
      pkg: { name: 'test-pkg', version: '1.0.0' },
      root: false,
      version: '1.0.0',
    });

    expect(pkg.additionalPaths).toEqual([]);
    expect(pkg.allPaths).toEqual(['/some/path']);
  });

  it('should include additionalPaths in allPaths when provided', () => {
    const pkg = new PackageInfo({
      additionalPaths: ['/external/a', '/external/b'],
      isPrivate: false,
      name: 'test-pkg',
      packagePath: '/some/path',
      packageJSONPath: '/some/path/package.json',
      pkg: { name: 'test-pkg', version: '1.0.0' },
      root: false,
      version: '1.0.0',
    });

    expect(pkg.additionalPaths).toEqual(['/external/a', '/external/b']);
    expect(pkg.allPaths).toEqual(['/some/path', '/external/a', '/external/b']);
  });
});
