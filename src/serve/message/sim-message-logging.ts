import type { SimAwsLoggedMessageKind } from "../../service/aws/message/sim-aws-logged-message.js";
import { defaultEmailTextLimit } from "./sim-email-log-block.js";

/**
 * Which kinds of message a served environment prints, and how much of an
 * email it prints.
 *
 * One property per kind, each on unless it is turned off, so naming one kind
 * says nothing about the others.
 */
export interface SimMessageLoggingProperties {
  /** The messages a simulated Cognito user pool would have sent. */
  readonly cognito?: boolean;

  /** The text messages simulated SNS would have sent. */
  readonly sns?: boolean;

  /** The email simulated SES has accepted. */
  readonly ses?: boolean;

  /**
   * How many characters of an email's text body are printed before it is cut
   * off, 2000 by default. The rest is reported as a count.
   */
  readonly emailTextLimit?: number;
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
 * The option arrives in three shapes and this is what the rest of the serving
 * layer asks of it: whether to print a message of this kind, and how much of
 * an email's text to print.
 */
export class SimMessageLogging {
  /**
   * How many characters of an email's text body are printed.
   */
  readonly emailTextLimit: number;

  readonly #cognito: boolean;
  readonly #sns: boolean;
  readonly #ses: boolean;

  constructor(option: SimMessageLoggingOption = true) {
    const properties: SimMessageLoggingProperties =
      typeof option === "boolean"
        ? { cognito: option, sns: option, ses: option }
        : option;

    this.#cognito = properties.cognito !== false;
    this.#sns = properties.sns !== false;
    this.#ses = properties.ses !== false;
    this.emailTextLimit = properties.emailTextLimit ?? defaultEmailTextLimit;
  }

  /**
   * Whether messages of this kind are printed.
   */
  prints(kind: SimAwsLoggedMessageKind): boolean {
    switch (kind) {
      case "cognito": {
        return this.#cognito;
      }
      case "sns": {
        return this.#sns;
      }
      case "ses": {
        return this.#ses;
      }
    }
  }

  /**
   * Whether any kind is printed at all.
   *
   * A server asked for none of them listens to nothing, so a simulation nobody
   * wants output from does no work for it.
   */
  get any(): boolean {
    return this.#cognito || this.#sns || this.#ses;
  }
}
