import { SimSnsInvalidParameterException } from "../error/sim-sns.error.js";

const maximumCharacters = 100;

/**
 * Real SNS takes a subject of printable ASCII only, so a newline or a control
 * character is refused rather than delivered in an email header.
 */
const printableAsciiPattern = /^[ -~]+$/;

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
    if (
      value.length > maximumCharacters ||
      !printableAsciiPattern.test(value)
    ) {
      throw new SimSnsInvalidParameterException(
        `Invalid parameter: Subject: Must be ASCII text that does not begin ` +
          `with whitespace, contains no line breaks or control characters, ` +
          `and is at most ${String(maximumCharacters)} characters long`,
      );
    }

    if (value.startsWith(" ")) {
      throw new SimSnsInvalidParameterException(
        "Invalid parameter: Subject: Must not begin with whitespace",
      );
    }

    return new this(value);
  }
}
