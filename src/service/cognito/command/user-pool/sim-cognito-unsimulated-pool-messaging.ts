import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import { SimCognitoUnsimulatedStructure } from "../sim-cognito-unsimulated-structure.js";
import type { SimCreateUserPoolCommandInput } from "./user-pool.command.js";

/**
 * The verification wording a pool is accepted with.
 *
 * These are the values `aws-cdk-lib` 2.262.1 emits for a `UserPool` construct
 * asking for nothing in particular, so a stack that only wants a pool
 * deploys. Whether real Cognito defaults a bare pool to the same wording was
 * not checked against a live account, so the CDK synth is the source here
 * rather than the AWS default.
 */
const verificationMessage =
  "The verification code to your new account is {####}";
const verificationSubject = "Verify your new account";
const verificationMessageTemplate = {
  DefaultEmailOption: "CONFIRM_WITH_CODE",
  EmailMessage: verificationMessage,
  EmailSubject: verificationSubject,
  SmsMessage: verificationMessage,
};

/**
 * What a refusal of the verification wording says would be lost.
 */
const verificationWording = "the wording of a verification message";

/**
 * Refuses the message delivery inputs this simulation does not model.
 *
 * Nothing here sends an email or a text message, so a delivery configuration
 * would be stored and never used.
 *
 * The verification wording is a narrower case. No message is delivered, so
 * the wording is never read either, and refusing the wording CDK emits would
 * refuse every stack that only wanted a pool. It is accepted at that wording
 * and refused at any other, because a request writing its own wording is
 * asking for a message a user would read.
 */
export class SimCognitoUnsimulatedUserPoolMessaging {
  private readonly unsimulated = new SimCognitoUnsimulatedInput(
    "CreateUserPool",
  );
  private readonly structure = new SimCognitoUnsimulatedStructure(
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
      "SmsAuthenticationMessage",
      input.SmsAuthenticationMessage,
      "multi-factor authentication messages",
    );

    this.refuseVerificationWording(input);
  }

  /**
   * Refuse verification wording other than the one this simulation accepts.
   */
  private refuseVerificationWording(
    input: SimCreateUserPoolCommandInput,
  ): void {
    this.unsimulated.refuseUnless(
      "EmailVerificationMessage",
      input.EmailVerificationMessage,
      verificationMessage,
      verificationWording,
    );
    this.unsimulated.refuseUnless(
      "EmailVerificationSubject",
      input.EmailVerificationSubject,
      verificationSubject,
      verificationWording,
    );
    this.unsimulated.refuseUnless(
      "SmsVerificationMessage",
      input.SmsVerificationMessage,
      verificationMessage,
      verificationWording,
    );
    this.structure.refuseUnless(
      "VerificationMessageTemplate",
      input.VerificationMessageTemplate,
      verificationMessageTemplate,
      verificationWording,
    );
  }
}
