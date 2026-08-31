import { SimSesNotFoundException } from "../error/sim-ses.error.js";
import { SimSesSuppressedDestination } from "./sim-ses-suppressed-destination.js";
import type { SimSesSuppressionReason } from "./sim-ses-suppression-reason.js";

/**
 * The account-level suppression list of one simulated SES scope.
 *
 * Real SES fills this from hard bounces and complaints. A test supplies those
 * events through the simulator's feedback operation. The ordinary suppression
 * commands also manage the same entries, giving application support tooling
 * and operations scripts somewhere to run.
 *
 * The list is region scoped, as identities and sends are. An address
 * suppressed in one region says nothing about another.
 *
 * Addresses are keyed exactly, including the case they were given in. That is
 * how real SES manages them, and it is the surprise worth reproducing:
 * `User@example.com` is stored as written, and removing it means asking for
 * that spelling. Sending is the other way round, and `matching` is what reads
 * it that way.
 */
export class SimSesSuppressionList {
  readonly #suppressed = new Map<string, SimSesSuppressedDestination>();

  /**
   * Every address on the list, in the order they were first put on it.
   */
  get all(): readonly SimSesSuppressedDestination[] {
    return this.#suppressed.values().toArray();
  }

  /**
   * Put an address on the list, replacing the reason of one already there.
   */
  put(
    emailAddress: string,
    reason: SimSesSuppressionReason,
    lastUpdateTime: Date,
  ): SimSesSuppressedDestination {
    const suppressed = new SimSesSuppressedDestination({
      emailAddress,
      reason,
      lastUpdateTime,
    });

    this.#suppressed.set(emailAddress, suppressed);

    return suppressed;
  }

  /**
   * Find an address on the list, matching the case it was stored in.
   */
  find(emailAddress: string): SimSesSuppressedDestination | undefined {
    return this.#suppressed.get(emailAddress);
  }

  /**
   * Get an address off the list, refusing one that is not on it.
   */
  require(emailAddress: string): SimSesSuppressedDestination {
    const suppressed = this.find(emailAddress);

    if (suppressed === undefined) {
      throw new SimSesNotFoundException(
        `Email address ${emailAddress} is not on the suppression list.`,
      );
    }

    return suppressed;
  }

  /**
   * The list entry a recipient would be held back by, ignoring case.
   *
   * Sending compares addresses this way on real SES, where managing the list
   * does not: a message to `User@example.com` is held back by a listed
   * `user@example.com`, while `DeleteSuppressedDestination` asked for the
   * first spelling would leave the second in place.
   */
  matching(emailAddress: string): SimSesSuppressedDestination | undefined {
    const wanted = emailAddress.toLowerCase();

    return this.#suppressed
      .values()
      .find((suppressed) => suppressed.emailAddress.toLowerCase() === wanted);
  }

  /**
   * Take an address off the list.
   *
   * Removing one that was never on it succeeds. The operation declares a
   * `NotFoundException` and the API reference does not say an unlisted address
   * raises it, and the support tool this list exists for should be able to
   * remove the same address twice without handling a failure.
   */
  delete(emailAddress: string): void {
    this.#suppressed.delete(emailAddress);
  }
}
