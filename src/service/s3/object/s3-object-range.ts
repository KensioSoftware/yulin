import { SimS3InvalidRange } from "../error/sim-s3.error.js";

/**
 * The bytes of an Object a read asked for, as offsets into it.
 */
export interface SimS3ObjectRange {
  readonly start: number;
  /** Inclusive, as the last byte of an HTTP byte range is. */
  readonly end: number;
}

/**
 * A single range of bytes, the only form S3 answers.
 *
 * A request for several ranges at once does not match, and neither does one
 * counted in anything but bytes, so both fall through to being read as no
 * range at all.
 */
const byteRange = /^\d*-\d*$/;

const byteUnit = "bytes=";

/**
 * Resolve the `Range` of a read against the Object it was sent for.
 *
 * `undefined` means the whole Object, and covers both a read that asked for no
 * range and one whose `Range` S3 does not answer. HTTP has an unsatisfiable
 * range refused and an unreadable one ignored, and S3 follows it. A range S3
 * cannot make sense of leaves the response as it would have been without it.
 * A range naming bytes the Object does not hold is refused outright.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html
 */
export function simS3ReadObjectRange(
  header: string | undefined,
  size: number,
): SimS3ObjectRange | undefined {
  const stated = header?.trim() ?? "";
  const spec = stated.startsWith(byteUnit) ? stated.slice(byteUnit.length) : "";

  if (!byteRange.test(spec)) {
    return undefined;
  }

  const dash = spec.indexOf("-");
  const from = spec.slice(0, dash);
  const to = spec.slice(dash + 1);

  if (from === "") {
    return suffixRange(to, size, stated);
  }

  return offsetRange(Number(from), to, size, stated);
}

/**
 * How a response describes the bytes it carries. It names them by offset, and
 * gives the size of the Object they came from.
 */
export function simS3ContentRange(
  range: SimS3ObjectRange,
  size: number,
): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}

/**
 * The last so many bytes of an Object, which is what a read states when it
 * knows how much it wants and not where the Object ends.
 */
function suffixRange(
  suffix: string,
  size: number,
  header: string,
): SimS3ObjectRange | undefined {
  // `bytes=-` says neither where to start nor how much to read.
  if (suffix === "") {
    return undefined;
  }

  const length = Number(suffix);

  // A suffix longer than the Object is the whole of it, so the only ones with
  // nothing to answer are a suffix of no bytes and any suffix of an Object of
  // no bytes.
  if (length === 0 || size === 0) {
    throw unsatisfiable(header, size);
  }

  return { start: Math.max(0, size - length), end: size - 1 };
}

/**
 * A range stated as where to start reading, and where to stop if the read is
 * not to run to the end of the Object.
 */
function offsetRange(
  start: number,
  to: string,
  size: number,
  header: string,
): SimS3ObjectRange | undefined {
  const statedEnd = to === "" ? undefined : Number(to);

  // A range ending before it begins is one no response could carry, so it is
  // read as no range rather than refused.
  if (statedEnd !== undefined && statedEnd < start) {
    return undefined;
  }

  if (start >= size) {
    throw unsatisfiable(header, size);
  }

  // A read may ask for more than is there, and gets what there is. A client
  // reading a file in fixed-size pieces asks for a whole piece at the end.
  return { start, end: Math.min(statedEnd ?? size - 1, size - 1) };
}

/**
 * Refuse a range of bytes the Object does not hold.
 *
 * `InvalidRange` is the code real S3 answers with, and 416 the status, so a
 * client reads why it has to ask again for something else.
 */
function unsatisfiable(header: string, size: number): Error {
  return new SimS3InvalidRange(
    `The requested range is not satisfiable. ${header} names bytes ` +
      `an S3 Object of ${size} bytes does not hold`,
  );
}
