/**
 * Shapes shared by the pack verification script and the throwaway consumer
 * project it installs the packed tarball into.
 */

export interface PackageManifest {
  readonly name: string;
  readonly exports: Readonly<Record<string, ExportTarget>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

export type ExportTarget =
  string | { readonly import: string; readonly types: string };

export interface Subpath {
  /** Specifier a consumer would import, e.g. `@kensio/yulin/s3`. */
  readonly specifier: string;
  /** Package-relative path to the declaration file. */
  readonly types: string;
  /** Export names this subpath must have, if any are named for it. */
  readonly requiredExports: readonly string[];
}

export interface ImportResult {
  readonly specifier: string;
  readonly ok: boolean;
  readonly exportCount: number;
  readonly error?: string;
}
