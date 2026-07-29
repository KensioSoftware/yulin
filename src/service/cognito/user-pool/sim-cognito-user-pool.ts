import { SimCognitoPoolAuth } from "./auth/sim-cognito-pool-auth.js";
import type { SimCognitoUserPoolClient } from "./client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPoolClientId } from "./client/sim-cognito-user-pool-client-id.js";
import { SimCognitoUserPoolClientStore } from "./client/sim-cognito-user-pool-client-store.js";
import type { SimCognitoGroup } from "./group/sim-cognito-group.js";
import type { SimCognitoGroupName } from "./group/sim-cognito-group-name.js";
import { SimCognitoGroupStore } from "./group/sim-cognito-group-store.js";
import type { SimCognitoDeletionProtection } from "./sim-cognito-deletion-protection.js";
import type { SimCognitoName } from "./sim-cognito-name.js";
import type { SimCognitoPasswordPolicy } from "./sim-cognito-password-policy.js";
import type { SimCognitoUserPoolArn } from "./sim-cognito-user-pool-arn.js";
import type { SimCognitoUserPoolId } from "./sim-cognito-user-pool-id.js";
import {
  SimCognitoSigningKey,
  type SimCognitoJwks,
} from "./token/sim-cognito-signing-key.js";
import type { SimCognitoUser } from "./user/sim-cognito-user.js";
import { SimCognitoUserStore } from "./user/sim-cognito-user-store.js";
import type { SimCognitoUsername } from "./user/sim-cognito-username.js";

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

  /**
   * The sign-ins part way through this pool, and the tokens it has issued.
   */
  public readonly auth = new SimCognitoPoolAuth();

  private readonly clientStore = new SimCognitoUserPoolClientStore();
  private readonly userStore = new SimCognitoUserStore();
  private readonly groupStore = new SimCognitoGroupStore();

  #signingKey: SimCognitoSigningKey | undefined;

  constructor(properties: SimCognitoUserPoolProperties) {
    this.id = properties.id;
    this.arn = properties.arn;
    this.name = properties.name.value;
    this.passwordPolicy = properties.passwordPolicy;
    this.deletionProtection = properties.deletionProtection;
    this.creationDate = properties.createdDate;
  }

  /**
   * The URL a token from this pool names as its issuer.
   *
   * The region comes out of the pool id, which is where SDK code and token
   * verifiers get it from too.
   */
  get issuerUrl(): string {
    const [regionName] = this.id.split("_", 1);

    return `https://cognito-idp.${String(regionName)}.amazonaws.com/${this.id}`;
  }

  /**
   * The key this pool signs its tokens with, generated on first use.
   *
   * The key belongs to the pool, as it does on real Cognito, so a token from
   * one pool does not carry a signature another pool's JWKS can verify.
   */
  get signingKey(): SimCognitoSigningKey {
    this.#signingKey ??= SimCognitoSigningKey.generate();

    return this.#signingKey;
  }

  /**
   * The public keys this pool publishes, in the shape its JWKS endpoint
   * serves.
   *
   * A verifier configured for this pool takes this document and verifies the
   * pool's tokens with nothing else needed. Real Cognito publishes two keys
   * and rotates between them, and this publishes one, so code assuming a
   * single entry passes here and is still wrong against real AWS.
   */
  jwks(): SimCognitoJwks {
    return { keys: [this.signingKey.publicJwk()] };
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

  /**
   * Every user in this pool, in creation order.
   */
  get users(): readonly SimCognitoUser[] {
    return this.userStore.all;
  }

  /**
   * How many users this pool holds.
   */
  get userCount(): number {
    return this.userStore.count;
  }

  /**
   * Store a newly created user, refusing a username already in this pool.
   */
  addUser(user: SimCognitoUser): void {
    this.userStore.add(user);
  }

  /**
   * Forget a deleted user, take them out of every group, and forget the
   * tokens they hold.
   *
   * A group holding a user that no longer exists would answer `ListUsersInGroup`
   * with a member this pool cannot describe, and a refresh token outliving its
   * user would sign in someone the pool cannot describe either.
   */
  removeUser(user: SimCognitoUser): void {
    this.userStore.remove(user);
    this.groupStore.forgetUser(user.username);
    this.auth.signOut(user.username);
  }

  /**
   * Find a user of this pool by username.
   */
  findUser(username: string): SimCognitoUser | undefined {
    return this.userStore.find(username);
  }

  /**
   * Resolve a user of this pool by username, or refuse.
   */
  requireUser(username: SimCognitoUsername): SimCognitoUser {
    return this.userStore.require(username);
  }

  /**
   * Every group in this pool, in creation order.
   */
  get groups(): readonly SimCognitoGroup[] {
    return this.groupStore.all;
  }

  /**
   * Store a newly created group, refusing a name already in this pool.
   */
  addGroup(group: SimCognitoGroup): void {
    this.groupStore.add(group);
  }

  /**
   * Forget a deleted group, and with it the membership of its users.
   */
  removeGroup(group: SimCognitoGroup): void {
    this.groupStore.remove(group);
  }

  /**
   * Find a group of this pool by name.
   */
  findGroup(groupName: string): SimCognitoGroup | undefined {
    return this.groupStore.find(groupName);
  }

  /**
   * Resolve a group of this pool by name, or refuse.
   */
  requireGroup(groupName: SimCognitoGroupName): SimCognitoGroup {
    return this.groupStore.require(groupName);
  }

  /**
   * The groups a user of this pool belongs to, strongest precedence first.
   */
  groupsOf(username: string): readonly SimCognitoGroup[] {
    return this.groupStore.forUser(username);
  }
}
