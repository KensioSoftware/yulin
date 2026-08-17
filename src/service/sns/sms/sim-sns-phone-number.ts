import { SimSnsInvalidParameterException } from "../error/sim-sns.error.js";

/**
 * E.164 form. A plus sign, a country code that never starts with zero, and
 * fifteen digits at the most.
 */
const phoneNumberPattern = /^\+[1-9]\d{1,14}$/;

/**
 * What a missing phone number is called in the error naming it.
 *
 * This is the wording the subscription protocol check uses for the same case.
 */
const missingNumber = "(none)";

/**
 * A phone number simulated SNS will send an SMS to.
 *
 * Real SNS takes E.164 and refuses everything else, and the opt-out list is
 * keyed by the same form. Holding it as a value keeps the check in one place.
 * A number that reaches the opt-out list or a recorded SMS has been through it
 * already.
 */
export class SimSnsPhoneNumber {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Read the phone number a request names, refusing one real SNS would refuse.
   *
   * The wording real SNS uses varies by operation. This is one message for all
   * of them, naming the parameter and the value the way the SNS errors here
   * already do.
   */
  static of(value: string = missingNumber): SimSnsPhoneNumber {
    if (!phoneNumberPattern.test(value)) {
      throw new SimSnsInvalidParameterException(
        `Invalid parameter: PhoneNumber Reason: ${value} is not an E.164 ` +
          `phone number`,
      );
    }

    return new this(value);
  }
}
