import { SimSnsInvalidParameterException } from "../error/sim-sns.error.js";

/**
 * One published message body.
 *
 * Real SNS refuses an empty message and holds the rest to a size limit it
 * shares with the message attributes, so the size is stated here and checked
 * where the two are added up.
 */
export class SimSnsMessageBody {
  public readonly value: string;
  public readonly byteSize: number;

  private constructor(value: string) {
    this.value = value;
    this.byteSize = Buffer.byteLength(value, "utf8");
  }

  /**
   * Read a message body, refusing one real SNS would refuse.
   */
  static of(value: string | undefined): SimSnsMessageBody {
    if (value === undefined || value === "") {
      throw new SimSnsInvalidParameterException(
        "Invalid parameter: Empty message",
      );
    }

    return new this(value);
  }
}
