import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type { SimAws } from "../aws/sim-aws.js";
import type {
  SimCfnStack,
  SimCloudFormationStackName,
} from "./stack/sim-cfn-stack.js";
import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../util/background/background.js";
import { assertDefined } from "../../util/type-guard/defined.js";
import { CreateStackCommandHandler } from "./command/create-stack/create-stack.handler.js";
import type {
  SimCreateStackCommand,
  SimCreateStackCommandOutput,
} from "./command/create-stack/create-stack.cmd.js";
import type {
  SimDescribeStacksCommand,
  SimDescribeStacksCommandOutput,
} from "./command/describe-stacks/describe-stacks.cmd.js";
import { DescribeStacksCommandHandler } from "./command/describe-stacks/describe-stacks.handler.js";
import type { SimCdkOutContext } from "./cdk/sim-cdk-out-context.js";
import {
  type SimCloudFormationCreateStackProps,
  SimCloudFormationTemplateDeployer,
} from "./deploy/sim-cfn-template-deployer.js";
import type { SimCloudFormationDeployTemplateFileProps } from "./deploy/sim-cfn-template-file-loader.js";
import type { SimCfnExecutableResourceBinding } from "./bind/sim-cfn-exec-binding.type.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";

interface SimCloudFormationProps {
  readonly simAws: SimAws;
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler & BackgroundCompleter;
}

/**
 * Simulated CloudFormation in one AWS Account and Region.
 */
export class SimCloudFormation {
  public readonly accountRegionScope: SimAwsAccountRegionScope;

  private readonly simAws: SimAws;
  private readonly background: BackgroundScheduler & BackgroundCompleter;
  private readonly stacks = new Map<SimCloudFormationStackName, SimCfnStack>();
  private readonly templateDeployer: SimCloudFormationTemplateDeployer;

  constructor(props: SimCloudFormationProps) {
    const {
      simAws,
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background,
    } = props;

    this.simAws = simAws;
    this.background = background;
    this.accountRegionScope = accountRegionScope;
    this.templateDeployer = new SimCloudFormationTemplateDeployer({
      simAws: this.simAws,
      accountRegionScope: this.accountRegionScope,
      stacks: this.stacks,
      background: this.background,
    });
  }

  /**
   * Get a simulated CloudFormation Stack by name.
   */
  getStackByName(
    stackName: SimCloudFormationStackName | string,
  ): SimCfnStack | undefined {
    return this.stacks.get(stackName as SimCloudFormationStackName);
  }

  /**
   * Handle a Create Stack Command from the SDK.
   */
  async createStack(
    cmd: SimCreateStackCommand,
  ): Promise<SimCreateStackCommandOutput> {
    return await this.createStackWithContext(cmd);
  }

  /**
   * Handle a Describe Stacks Command from the SDK.
   */
  async describeStacks(
    cmd: SimDescribeStacksCommand,
  ): Promise<SimDescribeStacksCommandOutput> {
    const handler = new DescribeStacksCommandHandler({
      stacks: this.stacks,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Wait for a simulated CloudFormation Stack deploy operation to complete.
   */
  async waitForStackDeployComplete(
    stackName: SimCloudFormationStackName | string,
  ): Promise<void> {
    const stack = this.getStackByName(stackName);
    assertDefined(stack, `Sim CloudFormation Stack named ${stackName}`);

    await stack.waitForDeployComplete();
  }

  /**
   * Convenience wrapper method to create and deploy a simulated CloudFormation
   * Stack from a parsed template object.
   */
  async deployTemplate(
    props: SimCloudFormationCreateStackProps,
  ): Promise<SimCfnStack> {
    return await this.templateDeployer.deployTemplate(props);
  }

  /**
   * Convenience wrapper method to create and deploy a simulated CloudFormation
   * Stack from a synthesized CDK template file.
   */
  async deployTemplateFile(
    props: SimCloudFormationDeployTemplateFileProps | string,
  ): Promise<SimCfnStack> {
    return await this.templateDeployer.deployTemplateFile(props);
  }

  private async createStackWithContext(
    cmd: SimCreateStackCommand,
    cdkOutContext?: SimCdkOutContext,
    bindings?: readonly SimCfnExecutableResourceBinding[],
  ): Promise<SimCreateStackCommandOutput> {
    const handler = new CreateStackCommandHandler({
      simAws: this.simAws,
      accountRegionScope: this.accountRegionScope,
      stacks: this.stacks,
      background: this.background,
      cdkOutContext,
      bindings,
    });
    return await handler.handle(cmd);
  }
}
