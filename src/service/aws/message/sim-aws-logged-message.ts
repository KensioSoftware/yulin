import type { SimCognitoMessageMedium } from "../../cognito/user-pool/message/sim-cognito-sent-message.js";
import type { SimCognitoMessageOccasion } from "../../cognito/user-pool/message/sim-cognito-message-occasion.js";
import type { SimSesSentEmailDestination } from "../../ses/email/sim-ses-sent-email.js";

/**
 * One message a simulated user pool has just recorded.
 *
 * The recipient and the body are what a local dev loop is after: the
 * confirmation code is in the body, and the address or number it went to says
 * which sign-up it belongs to.
 */
export interface SimCognitoLoggedMessage {
  readonly kind: "cognito";
  readonly userPoolId: string;
  readonly medium: SimCognitoMessageMedium;
  readonly recipient: string;
  readonly occasion: SimCognitoMessageOccasion;
  readonly subject: string | undefined;
  readonly body: string;
}

/**
 * One SMS a simulated SNS has just recorded.
 *
 * `suppressed` is the opt-out list having stopped this one. The publish
 * succeeded and nothing arrived, and a reader watching for a code needs to be
 * told that rather than left waiting.
 */
export interface SimSnsLoggedSms {
  readonly kind: "sns";
  readonly phoneNumber: string;
  readonly message: string;
  readonly suppressed: boolean;
}

/**
 * One email a simulated SES has just accepted.
 *
 * The three recipient lists stay three lists, because who was bcc'd is part of
 * what a reader is checking. Both body parts are carried whole. How much of
 * them is printed is the serving layer's decision, and an HTML part is
 * measured there rather than read out.
 */
export interface SimSesLoggedEmail {
  readonly kind: "ses";
  readonly fromEmailAddress: string;
  readonly destination: SimSesSentEmailDestination;
  readonly subject: string;
  readonly text: string | undefined;
  readonly html: string | undefined;
  readonly templateName: string | undefined;
  readonly templateData: Readonly<Record<string, unknown>> | undefined;
}

/**
 * A message a simulated service would have sent, in the shape the serving
 * layer prints it.
 *
 * Each kind carries its own fields because the kinds are different things. A
 * pool message has a subject and an occasion, an SMS has neither and can be
 * suppressed, and an email has three recipient lists and two body parts.
 * Flattening them into one shape would mean printing fields that are always
 * absent for most of the messages.
 */
export type SimAwsLoggedMessage =
  | SimCognitoLoggedMessage
  | SimSnsLoggedSms
  | SimSesLoggedEmail;

/**
 * Which kinds of message the serving layer prints.
 */
export type SimAwsLoggedMessageKind = SimAwsLoggedMessage["kind"];
