import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimCognitoUserPoolId } from "../sim-cognito-user-pool-id.js";
import type { SimCognitoExplicitAuthFlows } from "./sim-cognito-explicit-auth-flows.js";
import type { SimCognitoPreventUserExistenceErrors } from "./sim-cognito-prevent-user-existence-errors.js";
import type { SimCognitoTokenValidity } from "./sim-cognito-token-validity.js";
import type { SimCognitoUnsimulatedClientSettings } from "./sim-cognito-unsimulated-client-settings.js";
import type { SimCognitoUserPoolClientSettings } from "./sim-cognito-user-pool-client-settings.js";
import type { SimCognitoUserPoolClientId } from "./sim-cognito-user-pool-client-id.js";

interface SimCognitoUserPoolClientProperties {
  readonly id: SimCognitoUserPoolClientId;
  readonly userPoolId: SimCognitoUserPoolId;
  readonly secret: string | undefined;
  readonly settings: SimCognitoUserPoolClientSettings;
  readonly clock: SimClock;
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
  public readonly creationDate: Date;

  /**
   * The generated client secret, or undefined for a client created without
   * one. A public client has no secret at all rather than an empty one.
   */
  public readonly secret: string | undefined;

  private readonly clock: SimClock;
  private clientSettings: SimCognitoUserPoolClientSettings;
  private modifiedDate: Date;

  constructor(properties: SimCognitoUserPoolClientProperties) {
    this.id = properties.id;
    this.userPoolId = properties.userPoolId;
    this.secret = properties.secret;
    this.clientSettings = properties.settings;
    this.clock = properties.clock;
    this.creationDate = this.clock.now();
    this.modifiedDate = this.creationDate;
  }

  /**
   * The client's friendly name.
   */
  get name(): string {
    return this.clientSettings.name;
  }

  /**
   * The authentication flows this client allows.
   */
  get explicitAuthFlows(): SimCognitoExplicitAuthFlows {
    return this.clientSettings.explicitAuthFlows;
  }

  /**
   * Whether a sign-in naming an unknown user says so.
   */
  get preventUserExistenceErrors(): SimCognitoPreventUserExistenceErrors {
    return this.clientSettings.preventUserExistenceErrors;
  }

  /**
   * How long each kind of token this client is given lasts.
   */
  get tokenValidity(): SimCognitoTokenValidity {
    return this.clientSettings.tokenValidity;
  }

  /**
   * What the client was given and nothing here acts on, kept so a described
   * client reports it.
   */
  get unsimulatedSettings(): SimCognitoUnsimulatedClientSettings {
    return this.clientSettings.unsimulated;
  }

  /**
   * When the client's settings last changed, which is its creation date until
   * something updates it.
   */
  get lastModifiedDate(): Date {
    return this.modifiedDate;
  }

  /**
   * Whether the client was created with a secret, and so whether requests
   * made with it need a `SECRET_HASH`.
   */
  get hasSecret(): boolean {
    return this.secret !== undefined;
  }

  /**
   * Replace the client's settings.
   *
   * `UpdateUserPoolClient` replaces rather than merges, as real Cognito does,
   * so a setting the request left out goes back to the default a
   * `CreateUserPoolClient` request leaving it out would have got. The secret
   * is not among the settings and survives an update untouched, because real
   * Cognito has no way to change it either.
   */
  update(settings: SimCognitoUserPoolClientSettings): void {
    this.clientSettings = settings;
    this.modifiedDate = this.clock.now();
  }
}
