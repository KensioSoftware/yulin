import type { SimCognitoMessageMedium } from "./sim-cognito-sent-message.js";
import { SimCognitoMessageWording } from "./sim-cognito-message-wording.js";
import {
  requireSimCognitoVerificationWording,
  simCognitoLongestEmailMessage,
  simCognitoLongestSmsMessage,
} from "./sim-cognito-verification-wording.js";

/**
 * The wording real Cognito gives a pool that asked for none.
 *
 * These are the defaults the Cognito API documentation states for
 * `VerificationMessageTemplate`, rather than values read back from a live
 * account. A pool that sets its own wording never reaches them.
 */
const defaultEmailSubject = "Your verification code";
const defaultMessage = "Your verification code is {####}";

/**
 * The `VerificationMessageTemplate` a pool can be created with.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_VerificationMessageTemplateType.html
 */
export interface SimCognitoVerificationMessageTemplateType {
  readonly DefaultEmailOption?: string | undefined;
  readonly EmailMessage?: string | undefined;
  readonly EmailSubject?: string | undefined;
  readonly EmailMessageByLink?: string | undefined;
  readonly EmailSubjectByLink?: string | undefined;
  readonly SmsMessage?: string | undefined;
}

/**
 * The verification wording a request can set, in the shape the SDK sends it.
 */
export interface SimCognitoVerificationMessagesType {
  readonly EmailVerificationMessage?: string | undefined;
  readonly EmailVerificationSubject?: string | undefined;
  readonly SmsVerificationMessage?: string | undefined;
  readonly VerificationMessageTemplate?:
    SimCognitoVerificationMessageTemplateType | undefined;
}

/**
 * What a pool says in the message it sends a user signing itself up.
 *
 * The wording is read rather than accepted and ignored, because the pool
 * records the message it would have sent and a test reads it back. A pool that
 * asked for nothing gets the wording real Cognito gives one.
 *
 * `VerificationMessageTemplate` wins over the three older inputs where a
 * request sets both, and each of them fills in what the template left out.
 * What real Cognito does when the two disagree was not checked against a live
 * account, and a request naming one or the other behaves the same either way.
 *
 * Only the wording is read here. Confirming by following a link is refused by
 * SimCognitoUnsimulatedUserPoolMessaging before a pool gets this far, so
 * whatever wording arrives is wording for a code, and it is held to the rules
 * real Cognito holds it to: the code placeholder, and a length.
 */
export class SimCognitoVerificationMessages {
  public readonly emailSubject: string;
  public readonly emailMessage: string;
  public readonly smsMessage: string;

  private readonly requested: SimCognitoVerificationMessagesType;

  constructor(input: SimCognitoVerificationMessagesType) {
    const template = input.VerificationMessageTemplate;

    this.emailSubject =
      template?.EmailSubject ??
      input.EmailVerificationSubject ??
      defaultEmailSubject;
    this.emailMessage = requireSimCognitoVerificationWording(
      "EmailVerificationMessage",
      template?.EmailMessage ??
        input.EmailVerificationMessage ??
        defaultMessage,
      simCognitoLongestEmailMessage,
    );
    this.smsMessage = requireSimCognitoVerificationWording(
      "SmsVerificationMessage",
      template?.SmsMessage ?? input.SmsVerificationMessage ?? defaultMessage,
      simCognitoLongestSmsMessage,
    );
    this.requested = SimCognitoVerificationMessages.copied(input);
  }

  /**
   * The wording copied out of the request rather than kept by reference, so a
   * described pool reports what the request said at the time it was made even
   * where the caller edits the object afterwards.
   *
   * Each input is kept only where the request set it, so a pool created
   * without one describes without it rather than describing the default it
   * fell back to.
   */
  private static copied(
    input: SimCognitoVerificationMessagesType,
  ): SimCognitoVerificationMessagesType {
    return structuredClone({
      ...(input.EmailVerificationMessage !== undefined && {
        EmailVerificationMessage: input.EmailVerificationMessage,
      }),
      ...(input.EmailVerificationSubject !== undefined && {
        EmailVerificationSubject: input.EmailVerificationSubject,
      }),
      ...(input.SmsVerificationMessage !== undefined && {
        SmsVerificationMessage: input.SmsVerificationMessage,
      }),
      ...(input.VerificationMessageTemplate !== undefined && {
        VerificationMessageTemplate: input.VerificationMessageTemplate,
      }),
    });
  }

  /**
   * What this pool says in a verification message for one medium.
   */
  wording(medium: SimCognitoMessageMedium): SimCognitoMessageWording {
    if (medium === "SMS") {
      return new SimCognitoMessageWording({ body: this.smsMessage });
    }

    return new SimCognitoMessageWording({
      subject: this.emailSubject,
      body: this.emailMessage,
    });
  }

  /**
   * This wording as a described pool reports it, which is what the request
   * set and nothing it did not.
   */
  toOutput(): SimCognitoVerificationMessagesType {
    return structuredClone(this.requested);
  }
}
