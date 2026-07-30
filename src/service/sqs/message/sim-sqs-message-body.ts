import { createHash } from "node:crypto";
import { assertDefined } from "../../../util/type-guard/defined.js";
import {
  SimSqsInvalidMessageContents,
  SimSqsInvalidParameterValue,
} from "../error/sim-sqs.error.js";

const allowedControlCharacters = new Set([0x9, 0xa, 0xd]);
const space = 0x20;
const beforeSurrogates = 0xd7_ff;
const afterSurrogates = 0xe0_00;
const lastAllowedBmp = 0xff_fd;
const firstSupplementary = 0x1_00_00;
const lastSupplementary = 0x10_ff_ff;

/**
 * Whether a code point is one real SQS allows in a message body.
 *
 * The allowed set is tab, newline, carriage return, and the Unicode ranges
 * either side of the surrogate block. Anything else, a control character or a
 * lone surrogate, is refused rather than sent.
 */
function isAllowedInBody(codePoint: number): boolean {
  if (allowedControlCharacters.has(codePoint)) {
    return true;
  }

  return (
    (codePoint >= space && codePoint <= beforeSurrogates) ||
    (codePoint >= afterSurrogates && codePoint <= lastAllowedBmp) ||
    (codePoint >= firstSupplementary && codePoint <= lastSupplementary)
  );
}

/**
 * One message body, with the digest a sender checks it by.
 *
 * The digest is a real MD5 of the body, as real SQS reports, because that is the
 * whole point of it: a sender comparing `MD5OfMessageBody` against its own
 * digest either finds the body it sent or finds a bug, and a made-up value would
 * tell it nothing.
 */
export class SimSqsMessageBody {
  public readonly value: string;
  public readonly digest: string;

  private constructor(value: string) {
    this.value = value;
    this.digest = createHash("md5").update(value, "utf8").digest("hex");
  }

  /**
   * Read a message body, refusing one real SQS would refuse.
   */
  static of(value: string, maximumBytes: number): SimSqsMessageBody {
    if (value === "") {
      throw new SimSqsInvalidParameterValue(
        "The request must contain the parameter MessageBody",
      );
    }

    const byteLength = Buffer.byteLength(value, "utf8");

    if (byteLength > maximumBytes) {
      throw new SimSqsInvalidParameterValue(
        `One or more parameters are invalid. Reason: Message must be shorter ` +
          `than ${String(maximumBytes)} bytes, and this one is ` +
          `${String(byteLength)} bytes.`,
      );
    }

    // Iterating a string yields whole code points, so a surrogate pair is one
    // character here rather than two unpaired halves.
    for (const character of value) {
      const codePoint = character.codePointAt(0);

      assertDefined(codePoint, "Every character has a first code point");

      if (!isAllowedInBody(codePoint)) {
        throw new SimSqsInvalidMessageContents(
          "The message contains characters outside the allowed set",
        );
      }
    }

    return new this(value);
  }
}
