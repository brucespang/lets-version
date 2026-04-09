import fs from 'fs-extra';
import path from 'path';
import type { PackageJson } from 'type-fest';

import type { ChangeLogEntryFormatter, ChangeLogLineFormatter, ChangeLogRollupFormatter } from './types.js';

export interface ChangelogConfig {
  changeLogEntryFormatter?: ChangeLogEntryFormatter;
  changelogLineFormatter?: ChangeLogLineFormatter;
  changeLogRollupFormatter?: ChangeLogRollupFormatter;
}

/**
 * Per-package configuration options in letsVersion.config.mjs.
 */
export interface LetsVersionPackageConfig {
  /**
   * Additional filesystem paths whose changes should trigger a version bump
   * for this package. Useful when a package depends on source files that live
   * outside its own directory (e.g. native C/C++ sources consumed by a WASM
   * package).
   *
   * Paths are resolved **relative to the package directory**, not the
   * repository root. For example, if your repo looks like:
   *
   * ```
   * /
   *   c-src/
   *   js/
   *     packages/
   *       wasm-pkg/       <-- package directory
   * ```
   *
   * To watch `c-src/` for changes to `wasm-pkg`, you would configure:
   *
   * ```js
   * // letsVersion.config.mjs
   * export default {
   *   packages: {
   *     "wasm-pkg": {
   *       additionalPaths: ["../../../c-src"],
   *     },
   *   },
   * };
   * ```
   *
   * Multiple packages may reference the same additional path — a change in
   * that path will trigger a version bump for all of them.
   *
   * Each path must point to an existing directory or file on disk; an error
   * is thrown at startup if a resolved path does not exist.
   */
  additionalPaths?: string[];
}

/**
 * Root configuration for letsVersion.config.mjs.
 */
export interface LetsVersionConfig {
  /** Changelog formatting overrides. */
  changelog?: ChangelogConfig;

  /**
   * Per-package overrides, keyed by the package `name` field from its
   * package.json. See {@link LetsVersionPackageConfig} for available options.
   */
  packages?: Record<string, LetsVersionPackageConfig>;
}

/**
 * Utility function that returns an array of all paths
 * in the CWD up to the root
 */
function getAllFoldersUpToRoot(cwd: string): string[] {
  const out: string[] = [];

  let buffer = '';
  for (const char of cwd) {
    if (char === path.sep) out.push(buffer.length ? buffer : path.sep);

    buffer += char;
  }

  out.push(buffer);

  return out.sort((a, b) => b.localeCompare(a));
}

/**
 * Attempts to read the nearest turboTools.config.js file (if it exists)
 * and returns its contents
 */
export async function readLetsVersionConfig(cwd: string): Promise<LetsVersionConfig | null> {
  const getLetsVersionConfigFilePath = (prefix: string): string => {
    if (prefix.endsWith(path.sep)) return `${prefix}letsVersion.config.mjs`;
    return `${prefix}${path.sep}letsVersion.config.mjs`;
  };

  for (const dir of getAllFoldersUpToRoot(cwd)) {
    const configPath = getLetsVersionConfigFilePath(dir);
    const isFile = fs.statSync(configPath, { throwIfNoEntry: false })?.isFile() || false;
    if (isFile) {
      const result = await import(configPath);
      return result.default;
    }
  }

  return null;
}

/**
 * Simple pass-through utility for providing TypeScript typings
 * in non-TS environments when defining a config override
 */
export function defineLetsVersionConfig(config: LetsVersionConfig): LetsVersionConfig {
  return config;
}

export type { PackageJson };
export type { ChangeLogEntryFormatter, ChangeLogLineFormatter, ChangeLogRollupFormatter };
export { getAllFoldersUpToRoot };
