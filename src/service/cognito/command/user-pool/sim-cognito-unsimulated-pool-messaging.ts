import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type { SimCreateUserPoolCommandInput } from "./user-pool.command.js";

/**
 * Refuses the message delivery inputs this simulation does not model.
 *
 * Nothing here sends an email or a text message, so a template or a delivery
 * configuration would be stored and never used.
 */
export class SimCognitoUnsimulatedUserPoolMessaging {
  private readonly unsimulated = new SimCognitoUnsimulatedInput(
    "CreateUserPool",
  );

  /**
   * Refuse a request carrying a message setting this simulation cannot
   * honour.
   */
  refuseIn(input: SimCreateUserPoolCommandInput): void {
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
      "VerificationMessageTemplate",
      input.VerificationMessageTemplate,
      "verification messages",
    );
    this.unsimulated.refuse(
      "EmailVerificationMessage",
      input.EmailVerificationMessage,
      "verification messages",
    );
    this.unsimulated.refuse(
      "EmailVerificationSubject",
      input.EmailVerificationSubject,
      "verification messages",
    );
    this.unsimulated.refuse(
      "SmsVerificationMessage",
      input.SmsVerificationMessage,
      "verification messages",
    );
    this.unsimulated.refuse(
      "SmsAuthenticationMessage",
      input.SmsAuthenticationMessage,
      "multi-factor authentication messages",
    );
  }
}
