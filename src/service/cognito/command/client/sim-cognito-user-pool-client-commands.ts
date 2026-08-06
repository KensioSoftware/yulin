import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCognitoUserPoolClientFactory } from "../../user-pool/client/sim-cognito-user-pool-client-factory.js";
import { requireSimCognitoUserPoolClientId } from "../../user-pool/client/sim-cognito-user-pool-client-id.js";
import { SimCognitoUserPoolClientSettings } from "../../user-pool/client/sim-cognito-user-pool-client-settings.js";
import { requireSimCognitoUserPoolId } from "../../user-pool/sim-cognito-user-pool-id.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUserPoolStore } from "../../user-pool/sim-cognito-user-pool-store.js";
import type { SimCognitoAuthorizer } from "../authorize/sim-cognito-authorizer.js";
import { SimCognitoUnsimulatedUserPoolClientOptions } from "./sim-cognito-unsimulated-client-options.js";
import { SimCognitoUserPoolClientView } from "./sim-cognito-user-pool-client-view.js";
import type {
  SimCreateUserPoolClientCommand,
  SimCreateUserPoolClientCommandOutput,
  SimDeleteUserPoolClientCommand,
  SimDeleteUserPoolClientCommandOutput,
  SimDescribeUserPoolClientCommand,
  SimDescribeUserPoolClientCommandOutput,
  SimUpdateUserPoolClientCommand,
  SimUpdateUserPoolClientCommandOutput,
} from "./user-pool-client.command.js";

interface SimCognitoUserPoolClientCommandsProperties {
  readonly pools: SimCognitoUserPoolStore;
  readonly clientFactory: SimCognitoUserPoolClientFactory;
  readonly authorizer: SimCognitoAuthorizer;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that create, describe, change and delete a simulated app
 * client.
 *
 * Each one authorizes against the pool's ARN, because an app client has no
 * ARN of its own.
 */
export class SimCognitoUserPoolClientCommands {
  private readonly pools: SimCognitoUserPoolStore;
  private readonly clientFactory: SimCognitoUserPoolClientFactory;
  private readonly authorizer: SimCognitoAuthorizer;
  private readonly view = new SimCognitoUserPoolClientView();
  private readonly unsimulatedCreateOptions =
    new SimCognitoUnsimulatedUserPoolClientOptions("CreateUserPoolClient");
  private readonly unsimulatedUpdateOptions =
    new SimCognitoUnsimulatedUserPoolClientOptions("UpdateUserPoolClient");

  constructor(properties: SimCognitoUserPoolClientCommandsProperties) {
    this.pools = properties.pools;
    this.clientFactory = properties.clientFactory;
    this.authorizer = properties.authorizer;
  }

  /**
   * Create an app client in a pool.
   */
  create(
    command: SimCreateUserPoolClientCommand,
    options?: SimCognitoCommandOptions,
  ): SimCreateUserPoolClientCommandOutput {
    const { input } = command;
    const pool = this.authorizedPool(
      "cognito-idp:CreateUserPoolClient",
      input.UserPoolId,
      options,
    );

    this.unsimulatedCreateOptions.refuseIn(input);

    const client = this.clientFactory.make({
      pool,
      generateSecret: input.GenerateSecret,
      settings: new SimCognitoUserPoolClientSettings(input),
    });

    pool.addClient(client);

    return { $metadata: {}, UserPoolClient: this.view.describe(client) };
  }

  /**
   * Change an app client's settings.
   *
   * The settings are replaced by what the request holds, as real Cognito
   * replaces them, so one the request leaves out goes back to the default
   * `CreateUserPoolClient` would have given it. A request naming only
   * `ClientName` therefore sends the authentication flows and the token
   * lifetimes back to their defaults.
   *
   * The client's secret is not a setting and survives untouched.
   * `UpdateUserPoolClient` has no `GenerateSecret` input on real Cognito, so
   * a client created without a secret never gains one.
   *
   * `ClientName` is the one setting an omitted request keeps rather than
   * resets. A client has to have a name, and `CreateUserPoolClient` requires
   * one, so there is no default for an update to go back to.
   */
  update(
    command: SimUpdateUserPoolClientCommand,
    options?: SimCognitoCommandOptions,
  ): SimUpdateUserPoolClientCommandOutput {
    const { input } = command;
    const pool = this.authorizedPool(
      "cognito-idp:UpdateUserPoolClient",
      input.UserPoolId,
      options,
    );

    this.unsimulatedUpdateOptions.refuseIn(input);

    const client = pool.requireClient(
      requireSimCognitoUserPoolClientId(input.ClientId),
    );

    client.update(
      new SimCognitoUserPoolClientSettings({
        ...input,
        ClientName: input.ClientName ?? client.name,
      }),
    );

    return { $metadata: {}, UserPoolClient: this.view.describe(client) };
  }

  /**
   * Describe an app client's settings, including its secret.
   */
  describe(
    command: SimDescribeUserPoolClientCommand,
    options?: SimCognitoCommandOptions,
  ): SimDescribeUserPoolClientCommandOutput {
    const { input } = command;
    const pool = this.authorizedPool(
      "cognito-idp:DescribeUserPoolClient",
      input.UserPoolId,
      options,
    );
    const clientId = requireSimCognitoUserPoolClientId(input.ClientId);

    return {
      $metadata: {},
      UserPoolClient: this.view.describe(pool.requireClient(clientId)),
    };
  }

  /**
   * Delete an app client from a pool.
   */
  delete(
    command: SimDeleteUserPoolClientCommand,
    options?: SimCognitoCommandOptions,
  ): SimDeleteUserPoolClientCommandOutput {
    const { input } = command;
    const pool = this.authorizedPool(
      "cognito-idp:DeleteUserPoolClient",
      input.UserPoolId,
      options,
    );
    const clientId = requireSimCognitoUserPoolClientId(input.ClientId);

    pool.removeClient(pool.requireClient(clientId));

    return { $metadata: {} };
  }

  /**
   * Resolve the pool an app client operation names, once the caller is
   * allowed to reach it.
   *
   * Authorization comes before the lookup, as real IAM evaluates a request
   * before the service handles it, so a caller with no permission is refused
   * whether or not the pool is there.
   */
  private authorizedPool(
    action: string,
    requestedUserPoolId: string | undefined,
    options: SimCognitoCommandOptions | undefined,
  ): SimCognitoUserPool {
    const userPoolId = requireSimCognitoUserPoolId(requestedUserPoolId);

    this.authorizer.authorizeUserPool(action, userPoolId, options?.caller);

    return this.pools.require(userPoolId);
  }
}
