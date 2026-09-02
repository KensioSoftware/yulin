import { SimS3InvalidArgument } from "../error/sim-s3.error.js";
import type { SimS3CommonPrefix } from "./s3-common-prefix.js";
import { simS3EncodedKey } from "./s3-key-encoding.js";
import type { SimS3ObjectSummary } from "./s3-object-summary.js";

/**
 * The only encoding a listing can ask for, which is the only one real S3 has.
 */
const urlEncodingType = "url";

/**
 * How a listing writes the keys it answers with.
 *
 * A listing hands back keys, the prefix and delimiter it was asked for, and the
 * marker the next page starts at. All of them are keys or parts of one, so all
 * of them are encoded together or none of them are. That is what this decides,
 * once, for the whole page.
 *
 * A listing that asked for no encoding is answered with the keys as they are
 * stored, which is what almost every caller wants and what every caller got
 * before `EncodingType` was read at all.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html
 */
export class SimS3ListingEncoding {
  /**
   * The encoding type to report back, which real S3 echoes only when the
   * listing asked for one.
   */
  readonly encodingType: string | undefined;

  /**
   * A value real S3 does not have is refused rather than quietly treated as no
   * encoding, since a caller misspelling it would otherwise decode keys that
   * were never encoded.
   */
  constructor(encodingType?: string) {
    if (encodingType !== undefined && encodingType !== urlEncodingType) {
      throw new SimS3InvalidArgument(
        `Not an EncodingType real S3 has: ${encodingType}. ` +
          `The only one is "${urlEncodingType}".`,
      );
    }

    this.encodingType = encodingType;
  }

  /**
   * One key, prefix, delimiter or marker as the listing carries it.
   */
  value(value: string | undefined): string | undefined {
    if (value === undefined || this.encodingType === undefined) {
      return value;
    }

    return simS3EncodedKey(value);
  }

  /**
   * The Objects on a page, each under the key the listing carries.
   */
  summaries(
    summaries: SimS3ObjectSummary[] | undefined,
  ): SimS3ObjectSummary[] | undefined {
    if (summaries === undefined || this.encodingType === undefined) {
      return summaries;
    }

    return summaries.map((summary) =>
      /* v8 ignore next -- a listed Object always has a key */
      summary.Key === undefined
        ? summary
        : { ...summary, Key: simS3EncodedKey(summary.Key) },
    );
  }

  /**
   * The folders a page rolled keys up into, each under the prefix the listing
   * carries.
   */
  commonPrefixes(
    commonPrefixes: SimS3CommonPrefix[] | undefined,
  ): SimS3CommonPrefix[] | undefined {
    if (commonPrefixes === undefined || this.encodingType === undefined) {
      return commonPrefixes;
    }

    return commonPrefixes.map((commonPrefix) =>
      /* v8 ignore next -- a rolled-up folder always has a prefix */
      commonPrefix.Prefix === undefined
        ? commonPrefix
        : { Prefix: simS3EncodedKey(commonPrefix.Prefix) },
    );
  }
}
