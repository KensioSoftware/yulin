import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type { SimCognitoUserPoolClientSettingsInput } from "./user-pool-client.command.js";

/**
 * The app client inputs this simulation does not model, and what each of them
 * would have done on real AWS.
 *
 * `AWS::Cognito::UserPoolClient` carries all four under the same names, and
 * the CloudFormation layer reads this to say the same thing about a property
 * it drops as this says about an input it refuses.
 *
 * `ClientSecret` is absent because CloudFormation has no such property. A
 * template asks for a generated secret with `GenerateSecret` and reads the
 * secret back out. `EnableTokenRevocation` is absent because its refusal
 * depends on the value: `true` is what this simulation does, and only `false`
 * is refused.
 */
export const simCognitoUnsimulatedClientOptions = {
  AnalyticsConfiguration: "Amazon Pinpoint analytics",
  EnablePropagateAdditionalUserContextData: "threat protection context data",
  ReadAttributes: "per-client attribute permissions",
  WriteAttributes: "per-client attribute permissions",
} as const;

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
      simCognitoUnsimulatedClientOptions.AnalyticsConfiguration,
    );
    this.unsimulated.refuse(
      "EnablePropagateAdditionalUserContextData",
      input.EnablePropagateAdditionalUserContextData,
      simCognitoUnsimulatedClientOptions.EnablePropagateAdditionalUserContextData,
    );
    this.unsimulated.refuse(
      "ReadAttributes",
      input.ReadAttributes,
      simCognitoUnsimulatedClientOptions.ReadAttributes,
    );
    this.unsimulated.refuse(
      "WriteAttributes",
      input.WriteAttributes,
      simCognitoUnsimulatedClientOptions.WriteAttributes,
    );
  }
}
