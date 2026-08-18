import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type { SimCognitoPasswordResetCommandInput } from "./password-reset.command.js";

/**
 * Refuses the password reset inputs this simulation does not model.
 *
 * Both client-side operations carry the analytics and device context a real
 * app sends, and none of that is simulated, so an input asking for any of it
 * is refused rather than dropped.
 *
 * `ClientMetadata` is not among them. It exists to reach a Lambda trigger, and
 * the custom message and post confirmation triggers both run here, so the data
 * reaches the handler instead of being refused.
 */
export class SimCognitoUnsimulatedPasswordResetOptions {
  private readonly forgotInput = new SimCognitoUnsimulatedInput(
    "ForgotPassword",
  );
  private readonly confirmInput = new SimCognitoUnsimulatedInput(
    "ConfirmForgotPassword",
  );

  /**
   * Refuse a `ForgotPassword` request this simulation cannot honour.
   */
  refuseInForgot(input: SimCognitoPasswordResetCommandInput): void {
    this.refuseAppContext(this.forgotInput, input);
  }

  /**
   * Refuse a `ConfirmForgotPassword` request this simulation cannot honour.
   */
  refuseInConfirm(input: SimCognitoPasswordResetCommandInput): void {
    this.refuseAppContext(this.confirmInput, input);
  }

  /**
   * Refuse the two inputs both operations share.
   */
  private refuseAppContext(
    unsimulated: SimCognitoUnsimulatedInput,
    input: SimCognitoPasswordResetCommandInput,
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
