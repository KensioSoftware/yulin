import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCognitoGroupFactory } from "../../user-pool/group/sim-cognito-group-factory.js";
import { requireSimCognitoGroupName } from "../../user-pool/group/sim-cognito-group-name.js";
import { SimCognitoGroupSettings } from "../../user-pool/group/sim-cognito-group-settings.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
import { SimCognitoGroupView } from "./sim-cognito-group-view.js";
import type {
  SimCreateGroupCommand,
  SimCreateGroupCommandOutput,
  SimDeleteGroupCommand,
  SimDeleteGroupCommandOutput,
  SimGetGroupCommand,
  SimGetGroupCommandOutput,
  SimUpdateGroupCommand,
  SimUpdateGroupCommandOutput,
} from "./group.command.js";

interface SimCognitoGroupCommandsProperties {
  readonly resolver: SimCognitoRequestResolver;
  readonly groupFactory: SimCognitoGroupFactory;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that create, read, change and delete a simulated group.
 *
 * Each one authorizes against the pool's ARN, because a group has no ARN of
 * its own.
 */
export class SimCognitoGroupCommands {
  private readonly resolver: SimCognitoRequestResolver;
  private readonly groupFactory: SimCognitoGroupFactory;
  private readonly view = new SimCognitoGroupView();

  constructor(properties: SimCognitoGroupCommandsProperties) {
    this.resolver = properties.resolver;
    this.groupFactory = properties.groupFactory;
  }

  /**
   * Create a group in a pool.
   *
   * A group starts empty. `AdminAddUserToGroup` is what puts users in it.
   */
  create(
    command: SimCreateGroupCommand,
    options?: SimCognitoCommandOptions,
  ): SimCreateGroupCommandOutput {
    const { input } = command;
    const pool = this.resolver.pool(
      "cognito-idp:CreateGroup",
      input.UserPoolId,
      options,
    );

    const group = this.groupFactory.make({
      pool,
      name: requireSimCognitoGroupName(input.GroupName),
      settings: new SimCognitoGroupSettings(input),
    });

    pool.addGroup(group);

    return { $metadata: {}, Group: this.view.describe(group) };
  }

  /**
   * Read a group by name.
   */
  get(
    command: SimGetGroupCommand,
    options?: SimCognitoCommandOptions,
  ): SimGetGroupCommandOutput {
    const group = this.resolver.group(
      "cognito-idp:GetGroup",
      command.input,
      options,
    );

    return { $metadata: {}, Group: this.view.describe(group) };
  }

  /**
   * Change a group's description, precedence and role.
   *
   * All three are replaced by what the request holds, so a property the
   * request leaves out is cleared. Real Cognito does not say whether it
   * replaces or merges here, and a request naming every property is the one
   * thing that behaves the same either way.
   */
  update(
    command: SimUpdateGroupCommand,
    options?: SimCognitoCommandOptions,
  ): SimUpdateGroupCommandOutput {
    const { input } = command;
    const group = this.resolver.group(
      "cognito-idp:UpdateGroup",
      input,
      options,
    );

    group.update(new SimCognitoGroupSettings(input));

    return { $metadata: {}, Group: this.view.describe(group) };
  }

  /**
   * Delete a group from a pool.
   *
   * The users in it keep their accounts and stop being members, as they do on
   * real Cognito.
   */
  delete(
    command: SimDeleteGroupCommand,
    options?: SimCognitoCommandOptions,
  ): SimDeleteGroupCommandOutput {
    const { pool, group } = this.resolver.poolGroup(
      "cognito-idp:DeleteGroup",
      command.input,
      options,
    );

    pool.removeGroup(group);

    return { $metadata: {} };
  }
}
