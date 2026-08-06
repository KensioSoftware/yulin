import type { SimCognitoVerificationMessageTemplateType } from "../../user-pool/message/sim-cognito-verification-messages.js";
import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type { SimCognitoUserPoolCommandInput } from "./user-pool.command.js";

/**
 * What a refusal of the link options says would be lost.
 */
const linkVerification = "confirming a sign-up by following a link";

/**
 * Refuses the message delivery inputs this simulation does not model.
 *
 * Nothing here delivers an email or a text message. A pool records the message
 * it would have sent instead, which is Cognito's own delivery rather than
 * anything a delivery configuration points at: real Cognito with the default
 * `EmailSendingAccount` of `COGNITO_DEFAULT` sends through no other service.
 *
 * So a pool configured to send through SES or through an SNS SMS role is
 * refused. Accepting the configuration would say the messages went that way,
 * and they would not: they would be recorded here exactly as a pool with no
 * configuration at all records them.
 *
 * The wording of the messages is a different matter and is simulated. It is
 * read by SimCognitoVerificationMessages, which is what a recorded message
 * says. Verifying by following a link is not: nothing here serves the link,
 * and `ConfirmSignUp` with the code is the only way a user is confirmed, so a
 * pool that asked for a link would be tested against a flow it does not have
 * in a deployment.
 */
export class SimCognitoUnsimulatedUserPoolMessaging {
  private readonly unsimulated: SimCognitoUnsimulatedInput;

  constructor(operation: string) {
    this.unsimulated = new SimCognitoUnsimulatedInput(operation);
  }

  /**
   * Refuse a request carrying a message setting this simulation cannot
   * honour.
   */
  refuseIn(input: SimCognitoUserPoolCommandInput): void {
    this.unsimulated.refuse(
      "EmailConfiguration",
      input.EmailConfiguration,
      "email delivery",
    );
    this.unsimulated.refuse(
      "SmsConfiguration",
      input.SmsConfiguration,
      "SMS delivery",
    );
    this.unsimulated.refuse(
      "SmsAuthenticationMessage",
      input.SmsAuthenticationMessage,
      "multi-factor authentication messages",
    );

    this.refuseLinkVerification(input.VerificationMessageTemplate);
  }

  /**
   * Refuse a pool that verifies by following a link rather than by answering
   * with a code.
   */
  private refuseLinkVerification(
    template: SimCognitoVerificationMessageTemplateType | undefined,
  ): void {
    this.unsimulated.refuseUnless(
      "VerificationMessageTemplate DefaultEmailOption",
      template?.DefaultEmailOption,
      "CONFIRM_WITH_CODE",
      linkVerification,
    );
    this.unsimulated.refuse(
      "VerificationMessageTemplate EmailMessageByLink",
      template?.EmailMessageByLink,
      linkVerification,
    );
    this.unsimulated.refuse(
      "VerificationMessageTemplate EmailSubjectByLink",
      template?.EmailSubjectByLink,
      linkVerification,
    );
  }
}
