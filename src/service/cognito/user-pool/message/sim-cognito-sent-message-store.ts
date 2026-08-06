import type { SimCognitoSentMessage } from "./sim-cognito-sent-message.js";

/**
 * The messages one simulated user pool would have sent.
 *
 * They are kept in the order the pool sent them, so a test that signed a user
 * up and then asked for another code reads the two in that order.
 */
export class SimCognitoSentMessageStore {
  readonly #messages: SimCognitoSentMessage[] = [];

  /**
   * Keep a message the pool would have sent.
   */
  record(message: SimCognitoSentMessage): void {
    this.#messages.push(message);
  }

  /**
   * Every message, oldest first.
   */
  get all(): readonly SimCognitoSentMessage[] {
    return [...this.#messages];
  }
}
