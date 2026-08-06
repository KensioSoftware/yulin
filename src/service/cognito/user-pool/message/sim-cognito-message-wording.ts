import type { SimCognitoMessagePlaceholders } from "./sim-cognito-message-placeholders.js";

interface SimCognitoMessageWordingProperties {
  /** The subject, which a text message does not have. */
  readonly subject?: string | undefined;
  readonly body: string;
}

/**
 * What a `CustomMessage` handler wrote for one medium, either part of which it
 * may have left alone.
 */
export interface SimCognitoWrittenWording {
  readonly subject?: string | undefined;
  readonly body?: string | undefined;
}

/**
 * What a message says, before the placeholders in it are filled in.
 *
 * A pool has wording for each occasion it sends on, a `CustomMessage` handler
 * can return wording of its own in place of it, and the code and the username
 * go in last. Each of those steps hands on a wording rather than a pair of
 * strings, so the subject and the body cannot drift apart on the way.
 */
export class SimCognitoMessageWording {
  public readonly subject: string | undefined;
  public readonly body: string;

  constructor(properties: SimCognitoMessageWordingProperties) {
    this.subject = properties.subject;
    this.body = properties.body;
  }

  /**
   * This wording with whatever a `CustomMessage` handler wrote in place of it.
   *
   * A handler that wrote neither leaves the pool's own wording, which is what
   * a handler returning the event untouched does, and what a pool with no such
   * trigger at all gets.
   */
  replacedBy(written: SimCognitoWrittenWording): SimCognitoMessageWording {
    return new SimCognitoMessageWording({
      subject: written.subject ?? this.subject,
      body: written.body ?? this.body,
    });
  }

  /**
   * This wording with the code and the username filled in.
   */
  filledWith(
    placeholders: SimCognitoMessagePlaceholders,
  ): SimCognitoMessageWording {
    return new SimCognitoMessageWording({
      subject: placeholders.fillOptional(this.subject),
      body: placeholders.fill(this.body),
    });
  }
}
