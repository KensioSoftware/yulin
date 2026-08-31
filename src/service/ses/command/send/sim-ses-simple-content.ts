import { SimSesBadRequestException } from "../../error/sim-ses.error.js";
import type { SimSesSentEmailAttachment } from "../../email/sim-ses-sent-email.js";
import type { SimSesReadContent } from "./sim-ses-read-content.js";
import type { SimSesAttachment, SimSesMessage } from "./send.command.js";

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
    attachments: (message.Attachments ?? []).map((attachment, index) =>
      readAttachment(attachment, index),
    ),
    templateName: undefined,
    templateData: undefined,
  };
}

/** Read and validate one attachment from a simple message. */
function readAttachment(
  attachment: SimSesAttachment,
  index: number,
): SimSesSentEmailAttachment {
  if (attachment.RawContent === undefined) {
    throw missingAttachmentMember(index, "rawContent");
  }

  if (attachment.FileName === undefined) {
    throw missingAttachmentMember(index, "fileName");
  }

  return {
    rawContent: Uint8Array.from(attachment.RawContent),
    fileName: attachment.FileName,
    contentType: attachment.ContentType,
    contentDisposition: attachment.ContentDisposition,
    contentDescription: attachment.ContentDescription,
    contentId: attachment.ContentId,
    contentTransferEncoding: attachment.ContentTransferEncoding,
  };
}

/** Build the SES validation error for a missing attachment member. */
function missingAttachmentMember(
  index: number,
  member: "fileName" | "rawContent",
): SimSesBadRequestException {
  return new SimSesBadRequestException(
    "1 validation error detected: Value at " +
      `'content.simple.attachments.${String(index)}.${member}' failed to ` +
      "satisfy constraint: Member must not be null",
  );
}
