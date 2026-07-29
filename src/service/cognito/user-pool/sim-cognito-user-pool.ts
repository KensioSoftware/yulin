import type { SimCognitoUserPoolClient } from "./client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPoolClientId } from "./client/sim-cognito-user-pool-client-id.js";
import { SimCognitoUserPoolClientStore } from "./client/sim-cognito-user-pool-client-store.js";
import type { SimCognitoDeletionProtection } from "./sim-cognito-deletion-protection.js";
import type { SimCognitoName } from "./sim-cognito-name.js";
import type { SimCognitoPasswordPolicy } from "./sim-cognito-password-policy.js";
import type { SimCognitoUserPoolArn } from "./sim-cognito-user-pool-arn.js";
import type { SimCognitoUserPoolId } from "./sim-cognito-user-pool-id.js";

interface SimCognitoUserPoolProperties {
  readonly id: SimCognitoUserPoolId;
  readonly arn: SimCognitoUserPoolArn;
  readonly name: SimCognitoName;
  readonly passwordPolicy: SimCognitoPasswordPolicy;
  readonly deletionProtection: SimCognitoDeletionProtection;
  readonly createdDate: Date;
}

/**
 * One simulated Cognito user pool.
 *
 * The pool owns its app clients, because that is where they live on real
 * Cognito: deleting a pool takes its clients with it, and a client id means
 * nothing outside the pool that issued it.
 */
export class SimCognitoUserPool {
  public readonly id: SimCognitoUserPoolId;
  public readonly arn: SimCognitoUserPoolArn;
  public readonly name: string;
  public readonly passwordPolicy: SimCognitoPasswordPolicy;
  public readonly deletionProtection: SimCognitoDeletionProtection;
  public readonly creationDate: Date;

  private readonly clientStore = new SimCognitoUserPoolClientStore();

  constructor(properties: SimCognitoUserPoolProperties) {
    this.id = properties.id;
    this.arn = properties.arn;
    this.name = properties.name.value;
    this.passwordPolicy = properties.passwordPolicy;
    this.deletionProtection = properties.deletionProtection;
    this.creationDate = properties.createdDate;
  }

  /**
   * When the pool last changed.
   *
   * Nothing can change a pool here, as `UpdateUserPool` is not simulated, so
   * this is its creation date.
   */
  get lastModifiedDate(): Date {
    return this.creationDate;
  }

  /**
   * Every app client of this pool, in creation order.
   */
  get clients(): readonly SimCognitoUserPoolClient[] {
    return this.clientStore.all;
  }

  /**
   * The app client ids already in use in this pool.
   */
  get clientIds(): Set<string> {
    return this.clientStore.ids;
  }

  /**
   * Store a newly created app client.
   */
  addClient(client: SimCognitoUserPoolClient): void {
    this.clientStore.add(client);
  }

  /**
   * Forget a deleted app client.
   */
  removeClient(client: SimCognitoUserPoolClient): void {
    this.clientStore.remove(client);
  }

  /**
   * Find an app client of this pool by id.
   */
  findClient(clientId: string): SimCognitoUserPoolClient | undefined {
    return this.clientStore.find(clientId);
  }

  /**
   * Resolve an app client of this pool by id, or refuse.
   */
  requireClient(
    clientId: SimCognitoUserPoolClientId,
  ): SimCognitoUserPoolClient {
    return this.clientStore.require(clientId);
  }
}
