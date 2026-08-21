import { SimAwsMessageLog } from "../../aws/message/sim-aws-message-log.js";
import type { SimSesSentEmail } from "./sim-ses-sent-email.js";

const hoursInADay = 24;
const millisecondsInAnHour = 60 * 60 * 1000;

interface SimSesSentEmailStoreProperties {
  /**
   * Where each message is announced as it is kept, for a serving layer to
   * print.
   */
  readonly messageLog?: SimAwsMessageLog;
}

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
  readonly #messageLog: SimAwsMessageLog;

  constructor(properties: SimSesSentEmailStoreProperties = {}) {
    this.#messageLog = properties.messageLog ?? new SimAwsMessageLog();
  }

  /**
   * Every message this scope has accepted, oldest first.
   */
  get all(): readonly SimSesSentEmail[] {
    return [...this.#sent];
  }

  /**
   * Keep a message SES has accepted.
   *
   * Both ways a message is accepted come through here, a `SendEmail` from the
   * SDK and another simulated service sending on the account's behalf, so this
   * is the one place a message is announced from.
   */
  add(email: SimSesSentEmail): void {
    this.#sent.push(email);
    // Announced after it is kept, so a listener that goes and reads the store
    // finds the message it was just told about.
    this.#messageLog.record({
      kind: "ses",
      fromEmailAddress: email.fromEmailAddress,
      destination: email.destination,
      subject: email.subject,
      text: email.body.text,
      html: email.body.html,
      templateName: email.templateName,
      templateData: email.templateData,
    });
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
