import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type { SimCognitoUserPoolClientSettingsInput } from "./user-pool-client.command.js";

/**
 * Refuses the app client inputs this simulation does not model.
 *
 * Storing any of them would suggest an app client that works here would work
 * there. `CreateUserPoolClient` and `UpdateUserPoolClient` take the same
 * settings, so both refuse the same ones and each says its own name.
 */
export class SimCognitoUnsimulatedUserPoolClientOptions {
  private readonly unsimulated: SimCognitoUnsimulatedInput;

  constructor(operation: string) {
    this.unsimulated = new SimCognitoUnsimulatedInput(operation);
  }

  /**
   * Refuse a request carrying an input this simulation cannot honour.
   */
  refuseIn(input: SimCognitoUserPoolClientSettingsInput): void {
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
      "EnablePropagateAdditionalUserContextData",
      input.EnablePropagateAdditionalUserContextData,
      "threat protection context data",
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
