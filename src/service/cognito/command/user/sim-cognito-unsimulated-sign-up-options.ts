import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type {
  SimCognitoSignUpCommandInput,
  SimConfirmSignUpCommandInput,
  SimSignUpCommandInput,
} from "./sign-up.command.js";

/**
 * Refuses the sign-up inputs this simulation does not model.
 *
 * The three client-side operations share the analytics and device context a
 * real app sends, and none of that is simulated, so an input asking for any of
 * it is refused rather than dropped.
 *
 * `ClientMetadata` and `ValidationData` are not among them on the operations
 * that run a trigger. They exist to reach a Lambda trigger, and the pre sign-up
 * and post confirmation triggers run here, so the data reaches the handler
 * instead of being refused.
 */
export class SimCognitoUnsimulatedSignUpOptions {
  private readonly signUpInput = new SimCognitoUnsimulatedInput("SignUp");
  private readonly confirmInput = new SimCognitoUnsimulatedInput(
    "ConfirmSignUp",
  );
  private readonly resendInput = new SimCognitoUnsimulatedInput(
    "ResendConfirmationCode",
  );

  /**
   * Refuse a `SignUp` request this simulation cannot honour.
   */
  refuseInSignUp(input: SimSignUpCommandInput): void {
    this.refuseAppContext(this.signUpInput, input);
  }

  /**
   * Refuse a `ConfirmSignUp` request this simulation cannot honour.
   */
  refuseInConfirm(input: SimConfirmSignUpCommandInput): void {
    this.refuseAppContext(this.confirmInput, input);
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
   *
   * `ClientMetadata` is still refused here. The only trigger it would reach on
   * this operation is the custom message one, which writes the wording of a
   * message, and no message is ever delivered here.
   */
  refuseInResend(input: SimCognitoSignUpCommandInput): void {
    this.refuseAppContext(this.resendInput, input);
    this.resendInput.refuse(
      "ClientMetadata",
      input.ClientMetadata,
      "passing data to the custom message Lambda trigger",
    );
  }

  /**
   * Refuse the two inputs every client-side sign-up operation shares.
   */
  private refuseAppContext(
    unsimulated: SimCognitoUnsimulatedInput,
    input: SimCognitoSignUpCommandInput,
  ): void {
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
