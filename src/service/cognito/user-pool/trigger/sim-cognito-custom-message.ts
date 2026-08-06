import { SimCognitoInvalidLambdaResponseException } from "../../error/sim-cognito-trigger.error.js";
import type { SimCognitoMessageMedium } from "../message/sim-cognito-sent-message.js";
import type {
  SimCognitoMessageWording,
  SimCognitoWrittenWording,
} from "../message/sim-cognito-message-wording.js";

/**
 * The three fields a `CustomMessage` handler writes its message into.
 *
 * They are read as `unknown` because they are whatever the handler put there,
 * and a value that is not a string is refused rather than rendered into a
 * message.
 */
interface SimCognitoCustomMessageAnswer {
  readonly emailSubject?: unknown;
  readonly emailMessage?: unknown;
  readonly smsMessage?: unknown;
}

/**
 * The response half of the event a handler returned, or nothing where it wrote
 * no message.
 *
 * A pool with no `CustomMessage` trigger at all returns nothing, and a handler
 * that dropped the response wrote nothing. Both leave the pool's own wording in
 * place. A response that is something other than an object is refused: a
 * handler that put one there meant to say something, and this cannot read it.
 */
function answerOf(returned: unknown): SimCognitoCustomMessageAnswer {
  if (typeof returned !== "object" || returned === null) {
    return {};
  }

  const { response } = returned as { response?: unknown };

  if (response === undefined) {
    return {};
  }

  if (typeof response !== "object" || response === null) {
    throw new SimCognitoInvalidLambdaResponseException(
      `The CustomMessage trigger returned a response that is not an object, ` +
        `so there is no message in it. A handler writes its message into the ` +
        `response of the event it was given.`,
    );
  }

  return response;
}

/**
 * What a `CustomMessage` handler wrote in place of the pool's own wording.
 *
 * A handler writes into `response.emailSubject`, `response.emailMessage` and
 * `response.smsMessage`, and whichever it left alone leaves the pool's wording
 * in place. A handler that returned the event untouched has written nothing,
 * which is the ordinary case for a handler that only cares about one occasion.
 *
 * The message is not delivered here, so what the handler wrote is what the
 * pool records.
 */
export class SimCognitoCustomMessage {
  private readonly emailSubject: string | undefined;
  private readonly emailMessage: string | undefined;
  private readonly smsMessage: string | undefined;

  constructor(returned: unknown) {
    const answer = answerOf(returned);

    this.emailSubject = SimCognitoCustomMessage.text(
      "emailSubject",
      answer.emailSubject,
    );
    this.emailMessage = SimCognitoCustomMessage.text(
      "emailMessage",
      answer.emailMessage,
    );
    this.smsMessage = SimCognitoCustomMessage.text(
      "smsMessage",
      answer.smsMessage,
    );
  }

  private static text(field: string, value: unknown): string | undefined {
    if (value === undefined || typeof value === "string") {
      return value;
    }

    throw new SimCognitoInvalidLambdaResponseException(
      `The CustomMessage trigger returned a response whose ${field} is a ` +
        `${typeof value} rather than a string, so it is not a message the ` +
        `pool can send.`,
    );
  }

  /**
   * The pool's wording with what the handler wrote in place of it.
   */
  wordingFor(
    medium: SimCognitoMessageMedium,
    wording: SimCognitoMessageWording,
  ): SimCognitoMessageWording {
    return wording.replacedBy(this.writtenFor(medium));
  }

  /**
   * What the handler wrote for one medium.
   *
   * A text message has no subject, so `emailSubject` reaches an email only.
   */
  private writtenFor(
    medium: SimCognitoMessageMedium,
  ): SimCognitoWrittenWording {
    if (medium === "SMS") {
      return { body: this.smsMessage };
    }

    return { subject: this.emailSubject, body: this.emailMessage };
  }
}
