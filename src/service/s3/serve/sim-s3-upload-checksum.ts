import { createHash } from "node:crypto";

import { crc32 } from "../../../util/zip/crc32.js";

import {
  SimS3ChecksumMismatch,
  SimS3UnsupportedChecksum,
} from "../error/sim-s3-checksum.error.js";

const checksumPrefix = "x-amz-checksum-";

/**
 * The parameter naming which algorithm was used, rather than a checksum value.
 */
const algorithmParameter = "x-amz-checksum-algorithm";

/**
 * The checksum an upload states its body should hash to.
 *
 * S3's flexible checksums travel as `x-amz-checksum-<algorithm>`, in a header
 * on an ordinary request and in the query string of a presigned URL, where the
 * signature covers them. Checking one is the difference between an upload that
 * would work against real S3 and one that only appears to.
 */
export class SimS3UploadChecksum {
  private readonly algorithm: string;
  private readonly declared: string;

  private constructor(algorithm: string, declared: string) {
    this.algorithm = algorithm;
    this.declared = declared;
  }

  /**
   * Read the checksum an upload states, from wherever it carried it.
   *
   * The query string is read first because that is where a presigned URL puts
   * it, and a request that carries both should be judged by the one the
   * signature covers.
   */
  static stated(url: URL, headers: Headers): SimS3UploadChecksum | undefined {
    for (const [name, value] of url.searchParams) {
      const algorithm = checksumAlgorithm(name);

      if (algorithm !== undefined) {
        return new SimS3UploadChecksum(algorithm, value);
      }
    }

    for (const [name, value] of headers) {
      const algorithm = checksumAlgorithm(name);

      if (algorithm !== undefined) {
        return new SimS3UploadChecksum(algorithm, value);
      }
    }

    return undefined;
  }

  /**
   * Refuse an upload whose body does not hash to the stated checksum.
   */
  check(body: Uint8Array | undefined): void {
    const bytes = body ?? new Uint8Array();
    const computed = this.computed(bytes);

    if (computed === this.declared) {
      return;
    }

    throw new SimS3ChecksumMismatch(
      `The ${this.algorithm.toUpperCase()} checksum of the uploaded body is ` +
        `${computed}, not the ${this.declared} the request states. An AWS SDK ` +
        `presigned PUT states the checksum of an empty body unless the client ` +
        `is built with requestChecksumCalculation: "WHEN_REQUIRED".`,
    );
  }

  private computed(bytes: Uint8Array): string {
    if (this.algorithm === "crc32") {
      const digest = Buffer.alloc(4);
      digest.writeUInt32BE(crc32(bytes));
      return digest.toString("base64");
    }

    if (this.algorithm === "sha1" || this.algorithm === "sha256") {
      return createHash(this.algorithm).update(bytes).digest("base64");
    }

    throw new SimS3UnsupportedChecksum(
      `Simulated S3 cannot compute the ${this.algorithm.toUpperCase()} ` +
        `checksum this upload states, so it refuses the upload rather than ` +
        `storing a body nothing has checked. CRC32, SHA1 and SHA256 are ` +
        `simulated.`,
    );
  }
}

/**
 * The algorithm a checksum parameter or header names, if it names one.
 */
function checksumAlgorithm(name: string): string | undefined {
  const lowerCased = name.toLowerCase();

  if (
    lowerCased === algorithmParameter ||
    !lowerCased.startsWith(checksumPrefix)
  ) {
    return undefined;
  }

  return lowerCased.slice(checksumPrefix.length);
}
