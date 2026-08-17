import type { SimSnsPhoneNumber } from "./sim-sns-phone-number.js";

/**
 * The phone numbers one simulated SNS scope will send no SMS to.
 *
 * Real SNS puts a number on this list when the recipient replies STOP, and the
 * API only takes numbers back off it. `SimSns.optOutPhoneNumber` is what puts
 * one on. That is a deliberate divergence, for the same reason SES identity
 * verification is one. The act a recipient performs on a handset belongs to
 * the simulator, since a test process has no handset to perform it on.
 *
 * Numbers are held in the order they were opted out.
 * `ListPhoneNumbersOptedOut` reports them in that order.
 */
export class SimSnsOptOutList {
  readonly #optedOut = new Set<string>();

  /**
   * Every opted-out number, in the order they were opted out.
   */
  get all(): readonly string[] {
    return [...this.#optedOut];
  }

  /**
   * Stop sending SMS to a number, as a reply of STOP does on real SNS.
   *
   * Opting out a number already on the list leaves it where it is, so its
   * place in the listing stays put.
   */
  optOut(phoneNumber: SimSnsPhoneNumber): void {
    this.#optedOut.add(phoneNumber.value);
  }

  /**
   * Start sending SMS to a number again.
   *
   * Real SNS allows this once every thirty days per number and refuses a
   * second attempt inside the window. That limit is absent here. A test can
   * opt a number in as often as it needs to.
   */
  optIn(phoneNumber: SimSnsPhoneNumber): void {
    this.#optedOut.delete(phoneNumber.value);
  }

  /**
   * Whether SMS to this number would be stopped.
   */
  isOptedOut(phoneNumber: SimSnsPhoneNumber): boolean {
    return this.#optedOut.has(phoneNumber.value);
  }
}
