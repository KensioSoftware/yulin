import {
  SimSesBadRequestException,
  SimSesUnsupportedOperationException,
} from "../../error/sim-ses.error.js";
import type { SimSesSentEmailBody } from "../../email/sim-ses-sent-email.js";
import type { SimSesEmailContent, SimSesMessage } from "./send.command.js";

/**
 * What a message says, read out of the `Simple` content of a send.
 */
export interface SimSesReadContent {
  readonly subject: string;
  readonly body: SimSesSentEmailBody;
}

/**
 * Read the content of a send, refusing the shapes this simulation does not
 * model and the ones real SES would not accept.
 *
 * Only `Simple` content is read. A raw MIME message would have to be parsed to
 * say anything about its subject or body, and a template one needs templates,
 * which are not here yet. Both are refused by name so a caller finds out which
 * of the three branches it used rather than getting a recorded message with
 * nothing in it.
 */
export function readSimSesContent(
  content: SimSesEmailContent | undefined,
): SimSesReadContent {
  if (content === undefined) {
    throw new SimSesBadRequestException(
      "1 validation error detected: Value at 'content' failed to satisfy " +
        "constraint: Member must not be null",
    );
  }

  if (content.Raw !== undefined) {
    throw new SimSesUnsupportedOperationException(
      "Raw MIME content is not simulated, so SendEmail refuses Content.Raw " +
        "rather than recording a message it has not read",
    );
  }

  if (content.Template !== undefined) {
    throw new SimSesUnsupportedOperationException(
      "Email templates are not simulated yet, so SendEmail refuses " +
        "Content.Template rather than recording a message it cannot render",
    );
  }

  if (content.Simple === undefined) {
    throw new SimSesBadRequestException(
      "Content must specify one of Simple, Raw or Template.",
    );
  }

  return readSimpleMessage(content.Simple);
}

function readSimpleMessage(message: SimSesMessage): SimSesReadContent {
  if (message.Attachments !== undefined) {
    throw new SimSesUnsupportedOperationException(
      "Attachments are not simulated, so SendEmail refuses them rather than " +
        "recording a message without them",
    );
  }

  const subject = message.Subject?.Data;

  if (subject === undefined) {
    throw new SimSesBadRequestException(
      "1 validation error detected: Value at 'content.simple.subject' " +
        "failed to satisfy constraint: Member must not be null",
    );
  }

  const text = message.Body?.Text?.Data;
  const html = message.Body?.Html?.Data;

  if (text === undefined && html === undefined) {
    throw new SimSesBadRequestException(
      "1 validation error detected: Value at 'content.simple.body' failed " +
        "to satisfy constraint: Member must specify Text or Html",
    );
  }

  return { subject, body: { text, html } };
}
