import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPoolFactory } from "../../user-pool/sim-cognito-user-pool-factory.js";
import { requireSimCognitoUserPoolId } from "../../user-pool/sim-cognito-user-pool-id.js";
import { SimCognitoUserPoolSettings } from "../../user-pool/sim-cognito-user-pool-settings.js";
import type { SimCognitoUserPoolStore } from "../../user-pool/sim-cognito-user-pool-store.js";
import type { SimCognitoAuthorizer } from "../authorize/sim-cognito-authorizer.js";
import { SimCognitoUnsimulatedUserPoolIdentity } from "./sim-cognito-unsimulated-pool-identity.js";
import { SimCognitoUnsimulatedUserPoolOptions } from "./sim-cognito-unsimulated-pool-options.js";
import { SimCognitoUnsimulatedUserPoolUpdates } from "./sim-cognito-unsimulated-pool-updates.js";
import { SimCognitoUserPoolView } from "./sim-cognito-user-pool-view.js";
import type {
  SimCreateUserPoolCommand,
  SimCreateUserPoolCommandOutput,
  SimDeleteUserPoolCommand,
  SimDeleteUserPoolCommandOutput,
  SimDescribeUserPoolCommand,
  SimDescribeUserPoolCommandOutput,
  SimUpdateUserPoolCommand,
  SimUpdateUserPoolCommandOutput,
} from "./user-pool.command.js";

interface SimCognitoUserPoolCommandsProperties {
  readonly pools: SimCognitoUserPoolStore;
  readonly poolFactory: SimCognitoUserPoolFactory;
  readonly authorizer: SimCognitoAuthorizer;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that create, describe, change and delete a simulated user
 * pool.
 */
export class SimCognitoUserPoolCommands {
  private readonly pools: SimCognitoUserPoolStore;
  private readonly poolFactory: SimCognitoUserPoolFactory;
  private readonly authorizer: SimCognitoAuthorizer;
  private readonly view = new SimCognitoUserPoolView();
  private readonly unsimulatedOptions =
    new SimCognitoUnsimulatedUserPoolOptions("CreateUserPool");
  private readonly unsimulatedIdentity =
    new SimCognitoUnsimulatedUserPoolIdentity();
  private readonly unsimulatedUpdates =
    new SimCognitoUnsimulatedUserPoolUpdates();

  constructor(properties: SimCognitoUserPoolCommandsProperties) {
    this.pools = properties.pools;
    this.poolFactory = properties.poolFactory;
    this.authorizer = properties.authorizer;
  }

  /**
   * Create a user pool.
   *
   * The pool's id is allocated here rather than asked for, as it is on real
   * Cognito, so nothing can rely on a pool id being predictable.
   */
  create(
    command: SimCreateUserPoolCommand,
    options?: SimCognitoCommandOptions,
  ): SimCreateUserPoolCommandOutput {
    const { input } = command;

    this.authorizer.authorizeAny("cognito-idp:CreateUserPool", options?.caller);
    this.unsimulatedIdentity.refuseIn(input);
    this.unsimulatedOptions.refuseIn(input);

    const pool = this.poolFactory.make({
      name: input.PoolName,
      settings: input,
    });

    this.pools.add(pool);

    return { $metadata: {}, UserPool: this.view.describe(pool) };
  }

  /**
   * Change a user pool's settings.
   *
   * The settings are replaced rather than merged, as real Cognito replaces
   * them: a setting the request leaves out goes back to the default
   * `CreateUserPool` would have given it. A request naming every setting it
   * wants is the one that behaves the same here and on real AWS.
   *
   * Real `UpdateUserPool` answers with nothing, so `DescribeUserPool` is what
   * reads the change back.
   */
  update(
    command: SimUpdateUserPoolCommand,
    options?: SimCognitoCommandOptions,
  ): SimUpdateUserPoolCommandOutput {
    const { input } = command;
    const userPoolId = requireSimCognitoUserPoolId(input.UserPoolId);

    this.authorizer.authorizeUserPool(
      "cognito-idp:UpdateUserPool",
      userPoolId,
      options?.caller,
    );
    this.unsimulatedUpdates.refuseIn(input);

    this.pools
      .require(userPoolId)
      .update(
        new SimCognitoUserPoolSettings({ input, operation: "UpdateUserPool" }),
      );

    return { $metadata: {} };
  }

  /**
   * Describe a user pool's settings.
   */
  describe(
    command: SimDescribeUserPoolCommand,
    options?: SimCognitoCommandOptions,
  ): SimDescribeUserPoolCommandOutput {
    const userPoolId = requireSimCognitoUserPoolId(command.input.UserPoolId);

    this.authorizer.authorizeUserPool(
      "cognito-idp:DescribeUserPool",
      userPoolId,
      options?.caller,
    );

    return {
      $metadata: {},
      UserPool: this.view.describe(this.pools.require(userPoolId)),
    };
  }

  /**
   * Delete a user pool, and with it every app client in it.
   */
  delete(
    command: SimDeleteUserPoolCommand,
    options?: SimCognitoCommandOptions,
  ): SimDeleteUserPoolCommandOutput {
    const userPoolId = requireSimCognitoUserPoolId(command.input.UserPoolId);

    this.authorizer.authorizeUserPool(
      "cognito-idp:DeleteUserPool",
      userPoolId,
      options?.caller,
    );

    const pool = this.pools.require(userPoolId);

    if (pool.settings.deletionProtection.isActive) {
      throw new SimCognitoInvalidParameterException(
        `User pool ${userPoolId} is protected against deletion. Send an ` +
          `UpdateUserPool request with a DeletionProtection of INACTIVE ` +
          `first, as real Cognito wants.`,
      );
    }

    this.pools.remove(pool);

    return { $metadata: {} };
  }
}
