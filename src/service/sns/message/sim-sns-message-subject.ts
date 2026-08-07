import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimSnsInvalidParameterException } from "../error/sim-sns.error.js";

/**
 * Real SNS states the limit as fewer than 100 characters, so a subject of
 * exactly 100 is already too long.
 */
const maximumCharacters = 100;

const lastC0Control = 0x1f;
const firstC1Control = 0x7f;
const lastC1Control = 0x9f;

/**
 * Whether a code point is one real SNS refuses in a subject.
 *
 * The refused set is the C0 controls, which is where a line break lives, and
 * delete through the C1 controls. Everything else is allowed, because a subject
 * is UTF-8 text rather than ASCII text: one carrying an accented character or
 * an emoji reaches AWS, so it has to reach this simulation too.
 */
function isControlCharacter(codePoint: number): boolean {
  if (codePoint <= lastC0Control) {
    return true;
  }

  return codePoint >= firstC1Control && codePoint <= lastC1Control;
}

/**
 * The subject of one published message.
 *
 * Only the email protocols put a subject anywhere a person sees it, and neither
 * is simulated. It is still validated and carried, because it travels in the
 * SNS envelope a queue or a function receives, where a consumer can read it.
 */
export class SimSnsMessageSubject {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Read the subject a request carries, if it carries one.
   */
  static optional(value: string | undefined): SimSnsMessageSubject | undefined {
    if (value === undefined) {
      return undefined;
    }

    return this.of(value);
  }

  /**
   * Read a subject, refusing one real SNS would refuse.
   */
  static of(value: string): SimSnsMessageSubject {
    if (value.length >= maximumCharacters || this.hasControlCharacter(value)) {
      throw new SimSnsInvalidParameterException(
        `Invalid parameter: Subject: Must be UTF-8 text with no line breaks ` +
          `or control characters, and fewer than ` +
          `${String(maximumCharacters)} characters long`,
      );
    }

    return new this(value);
  }

  /**
   * Whether a subject carries a character real SNS refuses.
   *
   * Iterating a string yields whole code points, so a surrogate pair is one
   * character here rather than two unpaired halves.
   */
  private static hasControlCharacter(value: string): boolean {
    for (const character of value) {
      const codePoint = character.codePointAt(0);

      assertDefined(codePoint, "Every character has a first code point");

      if (isControlCharacter(codePoint)) {
        return true;
      }
    }

    return false;
  }
}
