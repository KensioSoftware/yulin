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
} from "./command/create-stack/create-stack.command.js";
import type {
  SimDescribeStacksCommand,
  SimDescribeStacksCommandOutput,
} from "./command/describe-stacks/describe-stacks.command.js";
import { DescribeStacksCommandHandler } from "./command/describe-stacks/describe-stacks.handler.js";
import type { SimCdkOutContext } from "./cdk/sim-cdk-out-context.js";
import {
  type SimCloudFormationCreateStackProps as SimCloudFormationCreateStackProperties,
  SimCloudFormationTemplateDeployer,
} from "./deploy/sim-cfn-template-deployer.js";
import type { SimCloudFormationDeployTemplateFileProps as SimCloudFormationDeployTemplateFileProperties } from "./deploy/sim-cfn-template-file-loader.js";
import type { SimCfnExecutableResourceBinding } from "./bind/sim-cfn-exec-binding.type.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import { SimCloudFormationSdkCommandRouter } from "./sdk/sim-cloudformation-sdk-command-router.js";
import type { SimSdkCommandRouter } from "../../sdk/index.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import { SimIamActionAuthorizer } from "../iam/authorize/sim-iam-action-authorizer.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";

/**
 * Options accepted by simulated CloudFormation command operations.
 */
export interface SimCloudFormationRequestOptions {
  readonly caller?: SimAwsCaller;
}

interface SimCloudFormationProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
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
  private readonly sdkRouter = new SimCloudFormationSdkCommandRouter(this);
  private readonly authorizer: SimIamActionAuthorizer;

  constructor(properties: SimCloudFormationProperties) {
    const {
      simAws,
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background,
    } = properties;

    this.simAws = simAws;
    this.background = background;
    this.accountRegionScope = accountRegionScope;
    this.authorizer = new SimIamActionAuthorizer({ iam });
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
    command: SimCreateStackCommand,
    options?: SimCloudFormationRequestOptions,
  ): Promise<SimCreateStackCommandOutput> {
    this.authorizer.authorize(
      "cloudformation:CreateStack",
      this.stackArn(command.input.StackName),
      options?.caller,
    );
    return await this.createStackWithContext(command);
  }

  /**
   * Handle a Describe Stacks Command from the SDK.
   */
  async describeStacks(
    command: SimDescribeStacksCommand,
    options?: SimCloudFormationRequestOptions,
  ): Promise<SimDescribeStacksCommandOutput> {
    this.authorizer.authorize(
      "cloudformation:DescribeStacks",
      this.stackArn(command.input.StackName),
      options?.caller,
    );
    const handler = new DescribeStacksCommandHandler({
      stacks: this.stacks,
      background: this.background,
    });
    return await handler.handle(command);
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
    properties: SimCloudFormationCreateStackProperties,
  ): Promise<SimCfnStack> {
    return await this.templateDeployer.deployTemplate(properties);
  }

  /**
   * Convenience wrapper method to create and deploy a simulated CloudFormation
   * Stack from a synthesized CDK template file.
   */
  async deployTemplateFile(
    properties: SimCloudFormationDeployTemplateFileProperties | string,
  ): Promise<SimCfnStack> {
    return await this.templateDeployer.deployTemplateFile(properties);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }

  /**
   * The Stack ARN a command operates on, for authorization.
   */
  private stackArn(stackName: string | undefined): string {
    const { accountId, regionName } = this.accountRegionScope;
    return `arn:aws:cloudformation:${regionName}:${accountId}:stack/${stackName ?? "*"}/*`;
  }

  private async createStackWithContext(
    command: SimCreateStackCommand,
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
    return await handler.handle(command);
  }
}
