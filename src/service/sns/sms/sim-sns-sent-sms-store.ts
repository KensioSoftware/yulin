import { SimAwsMessageLog } from "../../aws/message/sim-aws-message-log.js";
import type { SimSnsSentSmsMessage } from "./sim-sns-sent-sms-message.js";

interface SimSnsSentSmsStoreProperties {
  /**
   * Where each SMS is announced as it is kept, for a serving layer to print.
   */
  readonly messageLog?: SimAwsMessageLog;
}

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
  readonly #messageLog: SimAwsMessageLog;

  constructor(properties: SimSnsSentSmsStoreProperties = {}) {
    this.#messageLog = properties.messageLog ?? new SimAwsMessageLog();
  }

  /**
   * Every SMS this scope has accepted, oldest first.
   */
  get all(): readonly SimSnsSentSmsMessage[] {
    return [...this.#sent];
  }

  /**
   * Keep an SMS simulated SNS has accepted.
   *
   * Both ways an SMS is accepted come through here, a publish naming a phone
   * number and a topic fanning out to an `sms` subscription, so this is the
   * one place an SMS is announced from.
   */
  add(message: SimSnsSentSmsMessage): void {
    this.#sent.push(message);
    this.#messageLog.record({
      kind: "sns",
      phoneNumber: message.phoneNumber,
      message: message.message,
      suppressed: message.suppressed,
    });
  }
}
