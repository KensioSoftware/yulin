import type { SimAwsLoggedMessage } from "./sim-aws-logged-message.js";

/**
 * Something told about each message as it is recorded.
 */
export type SimAwsMessageListener = (message: SimAwsLoggedMessage) => void;

/**
 * Takes a listener off again.
 */
export type SimAwsMessageUnlisten = () => void;

/**
 * Where the simulated services that would have sent a message say so.
 *
 * One of these belongs to a SimAws instance and is shared by every scope in it.
 * The services record their own messages as they always did, and this is the
 * announcement on top: a local server listens here to print a Cognito
 * confirmation code or a text message to the console as it happens.
 *
 * A listener is added while a server is up and taken off when it closes, so a
 * simulation nobody is serving does the recording and announces to nobody.
 */
export class SimAwsMessageLog {
  readonly #listeners = new Set<SimAwsMessageListener>();

  /**
   * Be told about each message from now on, until the returned function is
   * called.
   *
   * Messages already recorded are not replayed. A listener hears what happens
   * while it is listening, and the record on the service is where the rest is.
   */
  listen(listener: SimAwsMessageListener): SimAwsMessageUnlisten {
    this.#listeners.add(listener);

    return (): void => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Announce one message a simulated service would have sent.
   *
   * Called by the service that recorded it, after it is recorded, so a
   * listener that reads the service back sees the message it was just told
   * about.
   */
  record(message: SimAwsLoggedMessage): void {
    for (const listener of this.#listeners) {
      listener(message);
    }
  }
}
