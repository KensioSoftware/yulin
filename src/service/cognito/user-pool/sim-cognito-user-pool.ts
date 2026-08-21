import type { SimClock } from "../../../util/clock/sim-clock.js";
import { SimCognitoPoolAuth } from "./auth/sim-cognito-pool-auth.js";
import type { SimCognitoUserPoolClient } from "./client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPoolClientId } from "./client/sim-cognito-user-pool-client-id.js";
import { SimCognitoUserPoolClientStore } from "./client/sim-cognito-user-pool-client-store.js";
import type { SimCognitoGroup } from "./group/sim-cognito-group.js";
import type { SimCognitoGroupName } from "./group/sim-cognito-group-name.js";
import { SimCognitoGroupStore } from "./group/sim-cognito-group-store.js";
import type { SimCognitoSentMessage } from "./message/sim-cognito-sent-message.js";
import { SimCognitoSentMessageStore } from "./message/sim-cognito-sent-message-store.js";
import type { SimCognitoName } from "./sim-cognito-name.js";
import type { SimCognitoUserPoolArn } from "./sim-cognito-user-pool-arn.js";
import {
  simCognitoUserPoolIssuerUrl,
  simCognitoUserPoolProviderName,
  type SimCognitoUserPoolId,
} from "./sim-cognito-user-pool-id.js";
import type { SimCognitoUserPoolSettings } from "./sim-cognito-user-pool-settings.js";
import { SimCognitoPoolKeys } from "./token/sim-cognito-pool-keys.js";
import type {
  SimCognitoJwks,
  SimCognitoSigningKey,
} from "./token/sim-cognito-signing-key.js";
import type { SimCognitoUser } from "./user/sim-cognito-user.js";
import type { SimCognitoWebAuthnCredentialDocument } from "./user/web-authn/sim-cognito-web-authn-document.js";
import { SimCognitoUserStore } from "./user/sim-cognito-user-store.js";
import {
  requireSimCognitoUsername,
  type SimCognitoUsername,
} from "./user/sim-cognito-username.js";

interface SimCognitoUserPoolProperties {
  readonly id: SimCognitoUserPoolId;
  readonly arn: SimCognitoUserPoolArn;
  readonly name: SimCognitoName;
  readonly settings: SimCognitoUserPoolSettings;
  readonly clock: SimClock;
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
  public readonly creationDate: Date;

  /**
   * The sign-ins part way through this pool, and the tokens it has issued.
   */
  public readonly auth = new SimCognitoPoolAuth();

  /**
   * The messages this pool would have sent. Nothing here delivers one, and
   * real Cognito reports its messages to nobody, so this is the simulator's
   * own record of what a user would have been sent.
   */
  public readonly messages = new SimCognitoSentMessageStore();

  private readonly clock: SimClock;
  private readonly clientStore = new SimCognitoUserPoolClientStore();
  private readonly userStore: SimCognitoUserStore;
  private readonly groupStore = new SimCognitoGroupStore();
  private readonly keys = new SimCognitoPoolKeys();

  #settings: SimCognitoUserPoolSettings;
  #modifiedDate: Date;

  constructor(properties: SimCognitoUserPoolProperties) {
    this.id = properties.id;
    this.arn = properties.arn;
    this.name = properties.name.value;
    this.#settings = properties.settings;
    this.userStore = new SimCognitoUserStore(
      properties.settings.usernameAttributes,
    );
    this.clock = properties.clock;
    this.creationDate = this.clock.now();
    this.#modifiedDate = this.creationDate;
  }

  /**
   * The settings this pool applies: its password policy, its deletion
   * protection, whether users may sign themselves up, and what confirming a
   * sign-up verifies.
   */
  get settings(): SimCognitoUserPoolSettings {
    return this.#settings;
  }

  /**
   * Replace this pool's settings with the ones an update asked for.
   *
   * `UpdateUserPool` replaces rather than merges, as real Cognito does, so a
   * setting the request left out goes back to the default `CreateUserPool`
   * would have given it rather than staying as it was.
   */
  update(settings: SimCognitoUserPoolSettings): void {
    this.#settings = settings;
    this.#modifiedDate = this.clock.now();
  }

  /** The URL a token from this pool names as its issuer. */
  get issuerUrl(): string {
    return simCognitoUserPoolIssuerUrl(this.id);
  }

  /** The name this pool is known by where a scheme would be wrong. */
  get providerName(): string {
    return simCognitoUserPoolProviderName(this.id);
  }

  /** The key this pool signs its tokens with, generated on first use. */
  get signingKey(): SimCognitoSigningKey {
    return this.keys.signingKey;
  }

  /** The public keys this pool publishes, as its JWKS endpoint serves them. */
  jwks(): SimCognitoJwks {
    return this.keys.jwks();
  }

  /**
   * When the pool's settings last changed, which is its creation date until
   * an `UpdateUserPool` request reaches it.
   */
  get lastModifiedDate(): Date {
    return this.#modifiedDate;
  }

  /** Every app client of this pool, in creation order. */
  get clients(): readonly SimCognitoUserPoolClient[] {
    return this.clientStore.all;
  }

  /** The app client ids already in use in this pool. */
  get clientIds(): Set<string> {
    return this.clientStore.ids;
  }

  /** Store a newly created app client. */
  addClient(client: SimCognitoUserPoolClient): void {
    this.clientStore.add(client);
  }

  /** Forget a deleted app client. */
  removeClient(client: SimCognitoUserPoolClient): void {
    this.clientStore.remove(client);
  }

  /** Find an app client of this pool by id. */
  findClient(clientId: string): SimCognitoUserPoolClient | undefined {
    return this.clientStore.find(clientId);
  }

  /** Resolve an app client of this pool by id, or refuse. */
  requireClient(
    clientId: SimCognitoUserPoolClientId,
  ): SimCognitoUserPoolClient {
    return this.clientStore.require(clientId);
  }

  /** Every user in this pool, in creation order. */
  get users(): readonly SimCognitoUser[] {
    return this.userStore.all;
  }

  /** How many users this pool holds. */
  get userCount(): number {
    return this.userStore.count;
  }

  /** Store a newly created user, refusing a username already in this pool. */
  addUser(user: SimCognitoUser): void {
    this.userStore.add(user);
  }

  /**
   * Forget a deleted user, take them out of every group, and forget the
   * tokens they hold. A group holding a user that no longer exists, or a
   * refresh token outliving one, would reach a user this pool cannot
   * describe.
   */
  removeUser(user: SimCognitoUser): void {
    this.userStore.remove(user);
    this.groupStore.forgetUser(user.username);
    this.auth.signOut(user.username);
  }

  /** Find a user of this pool by username. */
  findUser(username: string): SimCognitoUser | undefined {
    return this.userStore.find(username);
  }

  /** Resolve a user of this pool by username, or refuse. */
  requireUser(username: SimCognitoUsername): SimCognitoUser {
    return this.userStore.require(username);
  }

  /**
   * The confirmation code a user of this pool has outstanding, if it has one.
   *
   * This, `softwareTokenCode` and `webAuthnCredential` are the simulator's own
   * accessors, for a test with nowhere else to read a secret from: nothing
   * here delivers a message, holds the user's phone or runs a browser. Real
   * Cognito reports none of them to anybody.
   */
  confirmationCode(username: string): string | undefined {
    return this.userNamed(username).confirmationCode;
  }

  /**
   * The code a user's authenticator app is showing now. A test that would
   * rather compute it can do so from the `SecretCode`, which is a real shared
   * secret.
   */
  softwareTokenCode(username: string): string | undefined {
    return this.userNamed(username).mfa.codeAt(this.clock.now());
  }

  /**
   * The credential a user's authenticator would have created for the passkey
   * registration it has been given options for, which is what
   * `CompleteWebAuthnRegistration` takes as its `Credential`.
   */
  webAuthnCredential(username: string): SimCognitoWebAuthnCredentialDocument {
    return this.userNamed(username).webAuthn.registrationCredential();
  }

  /**
   * The credential a user's authenticator would have presented for the
   * `WEB_AUTHN` challenge a session was issued with.
   *
   * The session is the `Session` the challenge answered with, because the
   * challenge a passkey signs belongs to that one sign-in. Pass the result to
   * `RespondToAuthChallenge` as its `CREDENTIAL`, which travels as JSON.
   */
  webAuthnAssertion(session: string): SimCognitoWebAuthnCredentialDocument {
    const answering = this.auth.requireWebAuthnSession(session);
    const user = this.userNamed(answering.username);

    return user.webAuthn.device.present(
      answering.requireWebAuthnOptions(),
      Buffer.from(user.sub).toString("base64url"),
    );
  }

  /** Every message this pool would have sent, oldest first. */
  sentMessages(): readonly SimCognitoSentMessage[] {
    return this.messages.all;
  }

  /** Every group in this pool, in creation order. */
  get groups(): readonly SimCognitoGroup[] {
    return this.groupStore.all;
  }

  /** Store a newly created group, refusing a name already in this pool. */
  addGroup(group: SimCognitoGroup): void {
    this.groupStore.add(group);
  }

  /** Forget a deleted group, and with it the membership of its users. */
  removeGroup(group: SimCognitoGroup): void {
    this.groupStore.remove(group);
  }

  /** Find a group of this pool by name. */
  findGroup(groupName: string): SimCognitoGroup | undefined {
    return this.groupStore.find(groupName);
  }

  /** Resolve a group of this pool by name, or refuse. */
  requireGroup(groupName: SimCognitoGroupName): SimCognitoGroup {
    return this.groupStore.require(groupName);
  }

  /** The groups a user of this pool belongs to, strongest precedence first. */
  groupsOf(username: string): readonly SimCognitoGroup[] {
    return this.groupStore.forUser(username);
  }

  private userNamed(username: string): SimCognitoUser {
    return this.requireUser(requireSimCognitoUsername(username));
  }
}
