import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimLambdaFunctionVersionStore } from "../../function/version/sim-lambda-function-version-store.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { AddPermissionCommandHandler } from "../add-permission/add-permission.handler.js";
import type {
  SimAddPermissionCommand,
  SimAddPermissionCommandOutput,
} from "../add-permission/add-permission.command.js";
import { GetPolicyCommandHandler } from "../get-policy/get-policy.handler.js";
import type {
  SimGetPolicyCommand,
  SimGetPolicyCommandOutput,
} from "../get-policy/get-policy.command.js";
import { RemovePermissionCommandHandler } from "../remove-permission/remove-permission.handler.js";
import type {
  SimRemovePermissionCommand,
  SimRemovePermissionCommandOutput,
} from "../remove-permission/remove-permission.command.js";

interface SimLambdaPermissionCommandsProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly versions: SimLambdaFunctionVersionStore;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

interface SimLambdaPermissionCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The resource-policy commands of one simulated Lambda scope.
 *
 * These three share the same collaborators and differ only in the handler they
 * run, so grouping them keeps the SimLambda facade a thin delegation rather
 * than three near-identical wiring blocks.
 */
export class SimLambdaPermissionCommands {
  private readonly properties: SimLambdaPermissionCommandsProperties;

  constructor(properties: SimLambdaPermissionCommandsProperties) {
    this.properties = properties;
  }

  /**
   * Grant a permission on a function, or on the version or alias a qualifier
   * names.
   */
  async add(
    command: SimAddPermissionCommand,
    options?: SimLambdaPermissionCommandOptions,
  ): Promise<SimAddPermissionCommandOutput> {
    return await new AddPermissionCommandHandler(this.properties).handle(
      command,
      options,
    );
  }

  /**
   * Revoke a permission from a function, or from the version or alias a
   * qualifier names.
   */
  async remove(
    command: SimRemovePermissionCommand,
    options?: SimLambdaPermissionCommandOptions,
  ): Promise<SimRemovePermissionCommandOutput> {
    return await new RemovePermissionCommandHandler(this.properties).handle(
      command,
      options,
    );
  }

  /**
   * Read the resource policy of a function, or of the version or alias a
   * qualifier names.
   */
  async getPolicy(
    command: SimGetPolicyCommand,
    options?: SimLambdaPermissionCommandOptions,
  ): Promise<SimGetPolicyCommandOutput> {
    return await new GetPolicyCommandHandler(this.properties).handle(
      command,
      options,
    );
  }
}
