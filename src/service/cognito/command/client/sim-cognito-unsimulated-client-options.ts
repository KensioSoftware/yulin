import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import { SimCognitoUnsimulatedManagedLogin } from "./sim-cognito-unsimulated-managed-login.js";
import type { SimCreateUserPoolClientCommandInput } from "./user-pool-client.command.js";

/**
 * Refuses the CreateUserPoolClient inputs this simulation does not model.
 *
 * Storing any of them would suggest an app client that works here would work
 * there.
 */
export class SimCognitoUnsimulatedUserPoolClientOptions {
  private readonly unsimulated = new SimCognitoUnsimulatedInput(
    "CreateUserPoolClient",
  );
  private readonly managedLogin = new SimCognitoUnsimulatedManagedLogin();

  /**
   * Refuse a request carrying an input this simulation cannot honour.
   */
  refuseIn(input: SimCreateUserPoolClientCommandInput): void {
    this.managedLogin.refuseIn(input);

    this.unsimulated.refuseUnless(
      "EnableTokenRevocation",
      input.EnableTokenRevocation,
      true,
      "token revocation",
    );
    this.unsimulated.refuse(
      "ClientSecret",
      input.ClientSecret,
      "a secret of your own instead of a generated one",
    );
    this.unsimulated.refuse(
      "AnalyticsConfiguration",
      input.AnalyticsConfiguration,
      "Amazon Pinpoint analytics",
    );
    this.unsimulated.refuse(
      "AuthSessionValidity",
      input.AuthSessionValidity,
      "the authentication session lifetime",
    );
    this.unsimulated.refuse(
      "EnablePropagateAdditionalUserContextData",
      input.EnablePropagateAdditionalUserContextData,
      "threat protection context data",
    );
    this.unsimulated.refuse(
      "RefreshTokenRotation",
      input.RefreshTokenRotation,
      "refresh token rotation",
    );
    this.unsimulated.refuse(
      "ReadAttributes",
      input.ReadAttributes,
      "per-client attribute permissions",
    );
    this.unsimulated.refuse(
      "WriteAttributes",
      input.WriteAttributes,
      "per-client attribute permissions",
    );
  }
}
