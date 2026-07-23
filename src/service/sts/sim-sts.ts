import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimIamAccountResolver } from "../iam/registry/sim-iam-account-resolver.js";
import type {
  SimAssumeRoleCommand,
  SimAssumeRoleCommandOutput,
} from "./command/assume-role/assume-role.cmd.js";
import { AssumeRoleCommandHandler } from "./command/assume-role/assume-role.handler.js";
import { SimIamRegistry } from "../iam/registry/sim-iam-registry.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimAwsPrincipal } from "../aws/caller/sim-aws-caller.js";

interface SimStsProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iamResolver?: SimIamAccountResolver;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated AWS Security Token Service.
 *
 * STS is constructed from an Account/Region scope for consistency with other
 * simulated services. AssumeRole resolves IAM for both the source Account and
 * the target role's Account through the simulation-wide IAM registry.
 */
export class SimSts {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly background: BackgroundScheduler;
  private readonly iamResolver: SimIamAccountResolver;

  constructor(properties: SimStsProperties = {}) {
    this.accountRegionScope =
      properties.accountRegionScope ?? simAwsAccountRegionScopeFactory.make();
    this.iamResolver = properties.iamResolver ?? new SimIamRegistry();
    this.background = properties.background ?? new BackgroundTasks();
  }

  /**
   * Handle an AssumeRoleCommand from the SDK.
   */
  async assumeRole(
    command: SimAssumeRoleCommand,
    options?: {
      caller?: SimAwsPrincipal;
    },
  ): Promise<SimAssumeRoleCommandOutput> {
    const handler = new AssumeRoleCommandHandler({
      sourceAccountId: this.accountRegionScope.accountId,
      iamResolver: this.iamResolver,
      background: this.background,
    });
    return await handler.handle(command, options);
  }
}
