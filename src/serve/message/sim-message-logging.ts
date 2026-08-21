import type { SimAwsLoggedMessageKind } from "../../service/aws/message/sim-aws-logged-message.js";

/**
 * Which kinds of message a served environment prints.
 *
 * One property per kind, each on unless it is turned off, so naming one kind
 * says nothing about the others.
 */
export interface SimMessageLoggingProperties {
  /** The messages a simulated Cognito user pool would have sent. */
  readonly cognito?: boolean;

  /** The text messages simulated SNS would have sent. */
  readonly sns?: boolean;
}

/**
 * What `serveSimAws` takes for `messageLogging`.
 *
 * Left out, every kind is printed. `false` prints none of them, and an object
 * narrows it to the kinds it leaves on.
 */
export type SimMessageLoggingOption = boolean | SimMessageLoggingProperties;

/**
 * The message logging a server was asked for.
 *
 * The option arrives in three shapes and this is the one thing the rest of the
 * serving layer asks: whether to print a message of this kind.
 */
export class SimMessageLogging {
  readonly #cognito: boolean;
  readonly #sns: boolean;

  constructor(option: SimMessageLoggingOption = true) {
    const kinds: SimMessageLoggingProperties =
      typeof option === "boolean" ? { cognito: option, sns: option } : option;

    this.#cognito = kinds.cognito !== false;
    this.#sns = kinds.sns !== false;
  }

  /**
   * Whether messages of this kind are printed.
   */
  prints(kind: SimAwsLoggedMessageKind): boolean {
    return kind === "cognito" ? this.#cognito : this.#sns;
  }

  /**
   * Whether any kind is printed at all.
   *
   * A server asked for none of them listens to nothing, so a simulation nobody
   * wants output from does no work for it.
   */
  get any(): boolean {
    return this.#cognito || this.#sns;
  }
}
