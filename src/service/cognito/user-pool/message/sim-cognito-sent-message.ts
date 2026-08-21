import type { SimCognitoMessageOccasion } from "./sim-cognito-message-occasion.js";
import type { SimCognitoMessageWording } from "./sim-cognito-message-wording.js";

/**
 * How a pool would have delivered a message.
 *
 * Cognito picks the medium from the attribute it is writing to, so an email
 * address gets an email and a phone number gets a text message.
 */
export type SimCognitoMessageMedium = "EMAIL" | "SMS";

/**
 * One recorded message, in the shape the serve layer lists it in.
 */
export interface SimCognitoSentMessageOutput {
  readonly username: string;
  readonly recipient: string;
  readonly medium: SimCognitoMessageMedium;
  readonly subject?: string | undefined;
  readonly body: string;
  readonly occasion: SimCognitoMessageOccasion;
  readonly sentDate: string;
}

interface SimCognitoSentMessageProperties {
  readonly username: string;
  readonly recipient: string;
  readonly medium: SimCognitoMessageMedium;

  /** What the message says, with its placeholders already filled in. */
  readonly wording: SimCognitoMessageWording;
  readonly occasion: SimCognitoMessageOccasion;
  readonly sentDate: Date;
}

/**
 * One message a simulated user pool would have sent.
 *
 * Nothing is delivered. The pool keeps what it would have sent instead, which
 * is what lets a test assert that signing up produces a verification message
 * carrying the code, and what the wording a pool was created with is finally
 * read for.
 *
 * A pool keeps this record whichever service sent the message. One sending
 * through Cognito's own email has been through nothing else, and one whose
 * `EmailConfiguration` named `DEVELOPER` is recorded in `sesV2().sentEmails()`
 * as well. The two carry the same wording, code and all, and differ in what
 * they say around it. The SES record keeps the envelope, with the configured
 * `From`, the reply-to addresses and the configuration set. This one keeps
 * what Cognito knows, with the username and the occasion it sent on, and it is
 * what the serve layer lists at `/{userPoolId}/messages` for a browser sign-up
 * during local dev.
 */
export class SimCognitoSentMessage {
  /** The user the message was addressed to. */
  public readonly username: string;

  /** The email address or phone number it would have gone to. */
  public readonly recipient: string;

  public readonly medium: SimCognitoMessageMedium;

  /** The subject, which a text message does not have. */
  public readonly subject: string | undefined;

  public readonly body: string;

  /** What the pool was doing when it sent this. */
  public readonly occasion: SimCognitoMessageOccasion;

  public readonly sentDate: Date;

  constructor(properties: SimCognitoSentMessageProperties) {
    this.username = properties.username;
    this.recipient = properties.recipient;
    this.medium = properties.medium;
    this.subject = properties.wording.subject;
    this.body = properties.wording.body;
    this.occasion = properties.occasion;
    this.sentDate = properties.sentDate;
  }

  /**
   * This message as the serve layer lists it.
   *
   * The date is an ISO string because the listing is JSON, where a `Date` has
   * no representation of its own.
   */
  toOutput(): SimCognitoSentMessageOutput {
    return {
      username: this.username,
      recipient: this.recipient,
      medium: this.medium,
      ...(this.subject !== undefined && { subject: this.subject }),
      body: this.body,
      occasion: this.occasion,
      sentDate: this.sentDate.toISOString(),
    };
  }
}
