import {
  SimSesBadRequestException,
  SimSesUnsupportedOperationException,
} from "../../error/sim-ses.error.js";
import type { SimSesReadContent } from "./sim-ses-read-content.js";
import type { SimSesMessage } from "./send.command.js";

/**
 * Read a message a send wrote out in full, refusing what real SES refuses and
 * what this simulation does not model.
 *
 * The subject and a body are both required, as they are on real SES, so a send
 * missing either fails here rather than recording a message an account would
 * not have accepted.
 */
export function readSimSesSimpleMessage(
  message: SimSesMessage,
): SimSesReadContent {
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

  return {
    subject,
    body: { text, html },
    templateName: undefined,
    templateData: undefined,
  };
}
