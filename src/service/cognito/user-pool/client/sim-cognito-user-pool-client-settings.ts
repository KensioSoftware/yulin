import { SimCognitoName } from "../sim-cognito-name.js";
import { SimCognitoExplicitAuthFlows } from "./sim-cognito-explicit-auth-flows.js";
import { SimCognitoPreventUserExistenceErrors } from "./sim-cognito-prevent-user-existence-errors.js";
import {
  SimCognitoTokenValidity,
  type SimCognitoTokenValidityInput,
} from "./sim-cognito-token-validity.js";
import {
  SimCognitoUnsimulatedClientSettings,
  type SimCognitoUnsimulatedClientSettingsType,
} from "./sim-cognito-unsimulated-client-settings.js";

/**
 * The app client properties a request can set.
 *
 * `ClientId` is not among them: it identifies the client, and
 * `UpdateUserPoolClient` cannot change it. Nor is the secret, which an update
 * cannot touch either.
 */
export interface SimCognitoUserPoolClientSettingsProperties
  extends
    SimCognitoTokenValidityInput,
    SimCognitoUnsimulatedClientSettingsType {
  readonly ClientName?: string | undefined;
  readonly ExplicitAuthFlows?: readonly string[] | undefined;
  readonly PreventUserExistenceErrors?: string | undefined;
}

/**
 * The settable properties of one simulated app client.
 *
 * `CreateUserPoolClient` builds one of these from its request, and
 * `UpdateUserPoolClient` builds a fresh one and replaces what the client had.
 * That is why the defaults live here rather than in the create command: a
 * property an update leaves out goes back to the value a create would have
 * given it, which is what real Cognito does.
 */
export class SimCognitoUserPoolClientSettings {
  public readonly name: string;
  public readonly explicitAuthFlows: SimCognitoExplicitAuthFlows;
  public readonly preventUserExistenceErrors: SimCognitoPreventUserExistenceErrors;
  public readonly tokenValidity: SimCognitoTokenValidity;

  /**
   * What the request set and nothing here acts on, kept so a described client
   * reports it.
   */
  public readonly unsimulated: SimCognitoUnsimulatedClientSettings;

  constructor(properties: SimCognitoUserPoolClientSettingsProperties) {
    this.name = new SimCognitoName({
      field: "ClientName",
      value: properties.ClientName,
    }).value;
    this.explicitAuthFlows = new SimCognitoExplicitAuthFlows(
      properties.ExplicitAuthFlows,
    );
    this.preventUserExistenceErrors = new SimCognitoPreventUserExistenceErrors(
      properties.PreventUserExistenceErrors,
    );
    this.tokenValidity = new SimCognitoTokenValidity(properties);
    this.unsimulated = new SimCognitoUnsimulatedClientSettings(properties);
  }
}
