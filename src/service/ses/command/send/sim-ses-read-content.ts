import type {
  SimSesSentEmailAttachment,
  SimSesSentEmailBody,
} from "../../email/sim-ses-sent-email.js";

/**
 * What a message says, read out of the content of a send.
 *
 * A simple message carries its own wording; a template one carries the name of
 * the template that produced it and the data that filled it, so a test can
 * assert on either the rendered prose or on what went into it. Asserting on
 * the template and its substitutions is usually the better test: it survives
 * someone rewording the email.
 */
export interface SimSesReadContent {
  readonly subject: string;
  readonly body: SimSesSentEmailBody;
  readonly attachments: readonly SimSesSentEmailAttachment[];

  /** The template this was rendered from, if it was rendered from a stored one. */
  readonly templateName: string | undefined;

  /** The data the placeholders were filled from, parsed out of the JSON. */
  readonly templateData: Readonly<Record<string, unknown>> | undefined;
}
