import type { SimSesSentEmail } from "./sim-ses-sent-email.js";

const hoursInADay = 24;
const millisecondsInAnHour = 60 * 60 * 1000;

/**
 * The messages one simulated SES scope has accepted.
 *
 * Sends are kept in the order they were made, because the assertion a test
 * usually wants is about the first message of a flow: signing up sends a
 * welcome message, and whatever else follows is not what the test is looking
 * at.
 *
 * Nothing here is ever discarded. A real account has no such record at all, so
 * there is no retention behaviour to reproduce, and a test process is short
 * enough that keeping every message costs nothing.
 */
export class SimSesSentEmailStore {
  readonly #sent: SimSesSentEmail[] = [];

  /**
   * Every message this scope has accepted, oldest first.
   */
  get all(): readonly SimSesSentEmail[] {
    return [...this.#sent];
  }

  /**
   * Keep a message SES has accepted.
   */
  add(email: SimSesSentEmail): void {
    this.#sent.push(email);
  }

  /**
   * How many messages were accepted in the 24 hours up to an instant.
   *
   * This is what `GetAccount` reports as `SentLast24Hours`. It is counted from
   * the simulated clock rather than the host's, so a test that moves time
   * forward past the window sees the count fall the way an account's would.
   */
  countSentSince(now: Date): number {
    const windowStart = now.getTime() - hoursInADay * millisecondsInAnHour;

    return this.#sent.filter((email) => email.sentDate.getTime() > windowStart)
      .length;
  }
}
