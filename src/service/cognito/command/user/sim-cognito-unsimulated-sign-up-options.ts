import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type {
  SimAdminConfirmSignUpCommandInput,
  SimCognitoSignUpCommandInput,
  SimConfirmSignUpCommandInput,
  SimSignUpCommandInput,
} from "./sign-up.command.js";

/**
 * Refuses the sign-up inputs this simulation does not model.
 *
 * The four operations share most of them: every one can carry data for a
 * Lambda trigger, and the two client-side ones can carry the analytics and
 * device context a real app sends. None of that is simulated, so an input
 * asking for any of it is refused rather than dropped.
 */
export class SimCognitoUnsimulatedSignUpOptions {
  private readonly signUpInput = new SimCognitoUnsimulatedInput("SignUp");
  private readonly confirmInput = new SimCognitoUnsimulatedInput(
    "ConfirmSignUp",
  );
  private readonly resendInput = new SimCognitoUnsimulatedInput(
    "ResendConfirmationCode",
  );
  private readonly adminConfirmInput = new SimCognitoUnsimulatedInput(
    "AdminConfirmSignUp",
  );

  /**
   * Refuse a `SignUp` request this simulation cannot honour.
   *
   * `ValidationData` gets its own refusal because it exists only to be read by
   * a pre sign-up trigger: a request sending it is written against a trigger
   * that would not run here.
   */
  refuseInSignUp(input: SimSignUpCommandInput): void {
    this.refuseClientContext(this.signUpInput, input);
    this.signUpInput.refuse(
      "ValidationData",
      input.ValidationData,
      "passing data to a pre sign-up Lambda trigger",
    );
  }

  /**
   * Refuse a `ConfirmSignUp` request this simulation cannot honour.
   */
  refuseInConfirm(input: SimConfirmSignUpCommandInput): void {
    this.refuseClientContext(this.confirmInput, input);
    this.confirmInput.refuse(
      "ForceAliasCreation",
      input.ForceAliasCreation,
      "moving an email or phone number alias to the confirmed user",
    );
    this.confirmInput.refuse(
      "Session",
      input.Session,
      "continuing to a passwordless sign-in after confirming",
    );
  }

  /**
   * Refuse a `ResendConfirmationCode` request this simulation cannot honour.
   */
  refuseInResend(input: SimCognitoSignUpCommandInput): void {
    this.refuseClientContext(this.resendInput, input);
  }

  /**
   * Refuse an `AdminConfirmSignUp` request this simulation cannot honour.
   */
  refuseInAdminConfirm(input: SimAdminConfirmSignUpCommandInput): void {
    this.adminConfirmInput.refuse(
      "ClientMetadata",
      input.ClientMetadata,
      "passing data to a Lambda trigger",
    );
  }

  /**
   * Refuse the three inputs every client-side sign-up operation shares.
   */
  private refuseClientContext(
    unsimulated: SimCognitoUnsimulatedInput,
    input: SimCognitoSignUpCommandInput,
  ): void {
    unsimulated.refuse(
      "ClientMetadata",
      input.ClientMetadata,
      "passing data to a Lambda trigger",
    );
    unsimulated.refuse(
      "AnalyticsMetadata",
      input.AnalyticsMetadata,
      "recording the request against a Pinpoint analytics endpoint",
    );
    unsimulated.refuse(
      "UserContextData",
      input.UserContextData,
      "the device data threat protection judges a request by",
    );
  }
}
