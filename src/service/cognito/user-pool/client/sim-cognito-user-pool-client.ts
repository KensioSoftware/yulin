import type { SimCognitoName } from "../sim-cognito-name.js";
import type { SimCognitoUserPoolId } from "../sim-cognito-user-pool-id.js";
import type { SimCognitoExplicitAuthFlows } from "./sim-cognito-explicit-auth-flows.js";
import type { SimCognitoPreventUserExistenceErrors } from "./sim-cognito-prevent-user-existence-errors.js";
import type { SimCognitoTokenValidity } from "./sim-cognito-token-validity.js";
import type { SimCognitoUnsimulatedClientSettings } from "./sim-cognito-unsimulated-client-settings.js";
import type { SimCognitoUserPoolClientId } from "./sim-cognito-user-pool-client-id.js";

interface SimCognitoUserPoolClientProperties {
  readonly id: SimCognitoUserPoolClientId;
  readonly userPoolId: SimCognitoUserPoolId;
  readonly name: SimCognitoName;
  readonly secret: string | undefined;
  readonly explicitAuthFlows: SimCognitoExplicitAuthFlows;
  readonly preventUserExistenceErrors: SimCognitoPreventUserExistenceErrors;
  readonly tokenValidity: SimCognitoTokenValidity;
  readonly unsimulatedSettings: SimCognitoUnsimulatedClientSettings;
  readonly createdDate: Date;
}

/**
 * One simulated app client of a user pool.
 *
 * An app client is how an application reaches a pool, and what it holds
 * decides what that application can do: which authentication flows are open
 * to it, how long the tokens it receives last, and whether it has a secret
 * that requests have to be signed with.
 */
export class SimCognitoUserPoolClient {
  public readonly id: SimCognitoUserPoolClientId;
  public readonly userPoolId: SimCognitoUserPoolId;
  public readonly name: string;
  public readonly explicitAuthFlows: SimCognitoExplicitAuthFlows;
  public readonly preventUserExistenceErrors: SimCognitoPreventUserExistenceErrors;
  public readonly tokenValidity: SimCognitoTokenValidity;

  /**
   * What the client was created with and nothing here acts on, kept so a
   * described client reports it.
   */
  public readonly unsimulatedSettings: SimCognitoUnsimulatedClientSettings;

  public readonly creationDate: Date;

  /**
   * The generated client secret, or undefined for a client created without
   * one. A public client has no secret at all rather than an empty one.
   */
  public readonly secret: string | undefined;

  constructor(properties: SimCognitoUserPoolClientProperties) {
    this.id = properties.id;
    this.userPoolId = properties.userPoolId;
    this.name = properties.name.value;
    this.secret = properties.secret;
    this.explicitAuthFlows = properties.explicitAuthFlows;
    this.preventUserExistenceErrors = properties.preventUserExistenceErrors;
    this.tokenValidity = properties.tokenValidity;
    this.unsimulatedSettings = properties.unsimulatedSettings;
    this.creationDate = properties.createdDate;
  }

  /**
   * When the client last changed.
   *
   * Nothing can change an app client here, as `UpdateUserPoolClient` is not
   * simulated, so this is its creation date.
   */
  get lastModifiedDate(): Date {
    return this.creationDate;
  }

  /**
   * Whether the client was created with a secret, and so whether requests
   * made with it need a `SECRET_HASH`.
   */
  get hasSecret(): boolean {
    return this.secret !== undefined;
  }
}
