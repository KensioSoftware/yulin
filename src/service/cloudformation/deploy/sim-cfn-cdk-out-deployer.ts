import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimCfnStack } from "../stack/sim-cfn-stack.js";
import { cdkOutOptionsFor } from "./sim-cfn-cdk-out-stack-options.js";
import {
  planCdkOutDeployment,
  type SimCfnCdkOutPlan,
  type SimCfnCdkOutPlannedStack,
  type SimCloudFormationDeployCdkOutProperties,
} from "./sim-cfn-cdk-out-plan.js";

export type { SimCfnCdkOutStackOptions } from "./sim-cfn-cdk-out-stack-options.js";
export type { SimCloudFormationDeployCdkOutProperties } from "./sim-cfn-cdk-out-plan.js";

interface SimCfnCdkOutDeployerProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Deploys the Stacks a CDK cloud assembly holds, each into its own region.
 *
 * The Account is the one this deployer was made in. Only the region moves,
 * since that is what a synthesized environment names and what a caller
 * otherwise has to keep a constant for.
 */
export class SimCfnCdkOutDeployer {
  constructor(private readonly scope: SimCfnCdkOutDeployerProperties) {}

  async deploy(
    request: SimCloudFormationDeployCdkOutProperties | string,
  ): Promise<ReadonlyMap<string, SimCfnStack>> {
    const plan = await planCdkOutDeployment({
      request,
      defaultRegionName: this.scope.accountRegionScope.regionName,
    });

    const deployed = new Map<string, SimCfnStack>();

    for (const stack of plan.stacks) {
      // oxlint-disable-next-line no-await-in-loop -- one Stack at a time, since a later one may depend on an earlier one
      const deployedStack = await this.deployStack(stack, plan);

      deployed.set(stack.stackName, deployedStack);
    }

    return deployed;
  }

  private async deployStack(
    stack: SimCfnCdkOutPlannedStack,
    plan: SimCfnCdkOutPlan,
  ): Promise<SimCfnStack> {
    const { simAws, accountRegionScope } = this.scope;

    return await simAws
      .accountRegionScope(accountRegionScope.accountId, stack.regionName)
      .cloudFormation()
      .deployTemplateFile({
        templatePath: stack.templatePath,
        stackName: stack.stackName,
        ...cdkOutOptionsFor(stack, plan.stackOptions),
      });
  }
}
