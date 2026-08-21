import { SimCognitoName } from "../sim-cognito-name.js";
import { SimCognitoAuthSessionValidity } from "./sim-cognito-auth-session-validity.js";
import { SimCognitoExplicitAuthFlows } from "./sim-cognito-explicit-auth-flows.js";
import {
  SimCognitoOAuthSettings,
  type SimCognitoOAuthSettingsType,
} from "./sim-cognito-oauth-settings.js";
import { SimCognitoPreventUserExistenceErrors } from "./sim-cognito-prevent-user-existence-errors.js";
import {
  SimCognitoRefreshTokenRotation,
  type SimCognitoRefreshTokenRotationType,
} from "./sim-cognito-refresh-token-rotation.js";
import {
  SimCognitoTokenValidity,
  type SimCognitoTokenValidityInput,
} from "./sim-cognito-token-validity.js";

/**
 * The app client properties a request can set.
 *
 * `ClientId` is not among them: it identifies the client, and
 * `UpdateUserPoolClient` cannot change it. Nor is the secret, which an update
 * cannot touch either.
 */
export interface SimCognitoUserPoolClientSettingsProperties
  extends SimCognitoTokenValidityInput, SimCognitoOAuthSettingsType {
  readonly ClientName?: string | undefined;
  readonly AuthSessionValidity?: number | undefined;
  readonly ExplicitAuthFlows?: readonly string[] | undefined;
  readonly PreventUserExistenceErrors?: string | undefined;
  readonly RefreshTokenRotation?:
    | SimCognitoRefreshTokenRotationType
    | undefined;
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
   * How long a challenge this client issued can be answered for.
   */
  public readonly authSessionValidity: SimCognitoAuthSessionValidity;

  /**
   * Whether this client rotates its refresh tokens, which decides what
   * renews a session made through it.
   */
  public readonly refreshTokenRotation: SimCognitoRefreshTokenRotation;

  /**
   * What this client may do at the pool's hosted domain.
   */
  public readonly oauth: SimCognitoOAuthSettings;

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
    this.authSessionValidity = new SimCognitoAuthSessionValidity(
      properties.AuthSessionValidity,
    );
    this.refreshTokenRotation = new SimCognitoRefreshTokenRotation(
      properties.RefreshTokenRotation,
    );
    this.oauth = new SimCognitoOAuthSettings(properties);
  }
}
