import type { BackgroundScheduler } from "../../util/background/background.js";
import type * as simCognitoCommands from "./command/sim-cognito-command.types.js";
import type { SimCognitoCommands } from "./command/sim-cognito-commands.js";
import type {
  SimCognitoAuthorizeInput,
  SimCognitoHostedRedirect,
  SimCognitoLogoutInput,
  SimCognitoTokenInput,
  SimCognitoTokenOutput,
} from "./command/hosted/hosted-auth.command.js";
import {
  SimCognitoUserDirectory,
  type SimCognitoIdentityProviderRequestOptions,
} from "./sim-cognito-user-directory.js";
import type { SimCognitoUserPool } from "./user-pool/sim-cognito-user-pool.js";

export type { SimCognitoIdentityProviderRequestOptions } from "./sim-cognito-authentication.js";

interface SimCognitoFederationProperties {
  readonly commands: SimCognitoCommands;
  readonly background: BackgroundScheduler;
}

/**
 * The federated half of simulated Cognito: the domain a pool is signed in at,
 * the external identity providers it federates to, and the OAuth endpoints
 * that domain serves.
 *
 * The domain and provider operations are ordinary SDK commands.
 * `hostedAuthorize`, `hostedToken` and `hostedSignOut` are not: they are the
 * three endpoints a browser and an application's own server reach over HTTP,
 * and the serving layer is what turns a request into one of them. They are
 * here because they belong to this service's state, and because a test that
 * wants to drive a sign-in without an HTTP round trip can call them directly.
 */
export abstract class SimCognitoFederation extends SimCognitoUserDirectory {
  protected constructor(properties: SimCognitoFederationProperties) {
    super(properties);
  }

  /**
   * Handle a CreateUserPoolDomain Command from the SDK.
   */
  async createUserPoolDomain(
    command: simCognitoCommands.SimCreateUserPoolDomainCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimCreateUserPoolDomainCommandOutput> {
    await this.background.sequence();
    return this.commands.domains.create(command, options);
  }

  /**
   * Handle a DescribeUserPoolDomain Command from the SDK.
   */
  async describeUserPoolDomain(
    command: simCognitoCommands.SimDescribeUserPoolDomainCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimDescribeUserPoolDomainCommandOutput> {
    await this.background.sequence();
    return this.commands.domains.describe(command, options);
  }

  /**
   * Handle a DeleteUserPoolDomain Command from the SDK.
   */
  async deleteUserPoolDomain(
    command: simCognitoCommands.SimDeleteUserPoolDomainCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimDeleteUserPoolDomainCommandOutput> {
    await this.background.sequence();
    return this.commands.domains.delete(command, options);
  }

  /**
   * Handle a CreateIdentityProvider Command from the SDK.
   */
  async createIdentityProvider(
    command: simCognitoCommands.SimCreateIdentityProviderCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimCreateIdentityProviderCommandOutput> {
    await this.background.sequence();
    return this.commands.identityProviders.create(command, options);
  }

  /**
   * Handle a DescribeIdentityProvider Command from the SDK.
   */
  async describeIdentityProvider(
    command: simCognitoCommands.SimDescribeIdentityProviderCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimDescribeIdentityProviderCommandOutput> {
    await this.background.sequence();
    return this.commands.identityProviders.describe(command, options);
  }

  /**
   * Handle an UpdateIdentityProvider Command from the SDK.
   */
  async updateIdentityProvider(
    command: simCognitoCommands.SimUpdateIdentityProviderCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimUpdateIdentityProviderCommandOutput> {
    await this.background.sequence();
    return this.commands.identityProviders.update(command, options);
  }

  /**
   * Handle a DeleteIdentityProvider Command from the SDK.
   */
  async deleteIdentityProvider(
    command: simCognitoCommands.SimDeleteIdentityProviderCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimDeleteIdentityProviderCommandOutput> {
    await this.background.sequence();
    return this.commands.identityProviders.delete(command, options);
  }

  /**
   * Handle a ListIdentityProviders Command from the SDK.
   */
  async listIdentityProviders(
    command: simCognitoCommands.SimListIdentityProvidersCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimListIdentityProvidersCommandOutput> {
    await this.background.sequence();
    return this.commands.identityProviders.list(command, options);
  }

  /**
   * Handle a request to a pool's `/oauth2/authorize` endpoint.
   *
   * The answer is where the browser goes next, which for a request that signs
   * a user in is the app client's callback URL carrying an authorization code.
   */
  async hostedAuthorize(
    pool: SimCognitoUserPool,
    input: SimCognitoAuthorizeInput,
  ): Promise<SimCognitoHostedRedirect> {
    await this.background.sequence();
    return this.commands.hosted.authorize.handle(pool, input);
  }

  /**
   * Handle a request to a pool's `/oauth2/token` endpoint.
   */
  async hostedToken(
    pool: SimCognitoUserPool,
    input: SimCognitoTokenInput,
  ): Promise<SimCognitoTokenOutput> {
    await this.background.sequence();
    return await this.commands.hosted.token.handle(pool, input);
  }

  /**
   * Handle a request to a pool's `/logout` endpoint.
   */
  async hostedSignOut(
    pool: SimCognitoUserPool,
    input: SimCognitoLogoutInput,
  ): Promise<SimCognitoHostedRedirect> {
    await this.background.sequence();
    return this.commands.hosted.logout.handle(pool, input);
  }
}
