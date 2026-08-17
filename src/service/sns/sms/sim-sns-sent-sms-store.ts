import type { SimSnsSentSmsMessage } from "./sim-sns-sent-sms-message.js";

/**
 * The SMS messages one simulated SNS scope has accepted.
 *
 * They are kept in the order they were published, because the assertion a test
 * usually wants is about the first message of a flow. A one-time code is sent
 * once, and whatever else the flow texts afterwards is not what the test is
 * looking at.
 *
 * Nothing here is ever discarded. Real SNS keeps no such record at all, so
 * there is no retention behaviour to reproduce, and a test process is short
 * enough that keeping every message costs nothing.
 */
export class SimSnsSentSmsStore {
  readonly #sent: SimSnsSentSmsMessage[] = [];

  /**
   * Every SMS this scope has accepted, oldest first.
   */
  get all(): readonly SimSnsSentSmsMessage[] {
    return [...this.#sent];
  }

  /**
   * Keep an SMS simulated SNS has accepted.
   */
  add(message: SimSnsSentSmsMessage): void {
    this.#sent.push(message);
  }
}
