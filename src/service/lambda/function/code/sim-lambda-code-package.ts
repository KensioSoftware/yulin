import { createHash } from "node:crypto";

/**
 * The deployment package a function's code came from, as `CodeSha256` and
 * `CodeSize` report it.
 */
export interface SimLambdaCodePackage {
  /** The base64 SHA-256 digest of the package, as real Lambda encodes it. */
  readonly sha256: string;
  /** The package's size in bytes. */
  readonly size: number;
}

/**
 * The package a zip archive's bytes make.
 */
export function simLambdaCodePackageOf(
  bytes: Uint8Array,
): SimLambdaCodePackage {
  return {
    sha256: createHash("sha256").update(bytes).digest("base64"),
    size: bytes.byteLength,
  };
}

/**
 * The package standing for code that arrived as something other than archive
 * bytes, such as a handler function reference or a container image URI.
 *
 * The digest is taken over the text that identifies the code, so replacing the
 * code changes it. The size is 0, as real Lambda reports for an image.
 */
export function simLambdaCodePackageNamed(
  identity: string,
): SimLambdaCodePackage {
  return {
    sha256: createHash("sha256").update(identity).digest("base64"),
    size: 0,
  };
}
