import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type { SimAws } from "../aws/sim-aws.js";
import type {
  SimCfnStack,
  SimCloudFormationStackName,
} from "./stack/sim-cfn-stack.js";
import type { SimCfnDeployedStack } from "./stack/sim-cfn-deployed-stack.type.js";
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
import type {
  SimDeleteStackCommand,
  SimDeleteStackCommandOutput,
} from "./command/delete-stack/delete-stack.command.js";
import { DeleteStackCommandHandler } from "./command/delete-stack/delete-stack.handler.js";
import type {
  SimUpdateStackCommand,
  SimUpdateStackCommandOutput,
} from "./command/update-stack/update-stack.command.js";
import { UpdateStackCommandHandler } from "./command/update-stack/update-stack.handler.js";
import {
  type SimCloudFormationCreateStackProperties as SimCloudFormationCreateStackProperties,
  SimCloudFormationTemplateDeployer,
} from "./deploy/sim-cfn-template-deployer.js";
import type { SimCloudFormationDeployTemplateFileProperties as SimCloudFormationDeployTemplateFileProperties } from "./deploy/sim-cfn-template-file-loader.js";
import type { SimCloudFormationDeployCdkOutProperties } from "./deploy/sim-cfn-cdk-out-deployer.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import { SimCfnExports } from "./export/sim-cfn-exports.js";
import { SimCloudFormationSdkCommandRouter } from "./sdk/sim-cloudformation-sdk-command-router.js";
import type { SimSdkCommandRouter } from "../../sdk/index.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import { SimCloudFormationAuthorization } from "./authorize/sim-cloudformation-authorization.js";
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
  private readonly exports = new SimCfnExports();
  private readonly templateDeployer: SimCloudFormationTemplateDeployer;
  private readonly sdkRouter = new SimCloudFormationSdkCommandRouter(this);
  private readonly authorization: SimCloudFormationAuthorization;

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
    this.authorization = new SimCloudFormationAuthorization({
      iam,
      accountRegionScope: this.accountRegionScope,
    });
    this.templateDeployer = new SimCloudFormationTemplateDeployer({
      simAws: this.simAws,
      accountRegionScope: this.accountRegionScope,
      stacks: this.stacks,
      background: this.background,
      exports: this.exports,
    });
  }

  /** Get a deployed simulated CloudFormation Stack by name. */
  getStackByName(
    stackName: SimCloudFormationStackName | string,
  ): SimCfnDeployedStack | undefined {
    return this.stacks.get(stackName as SimCloudFormationStackName);
  }

  /**
   * Handle a Create Stack Command from the SDK.
   */
  async createStack(
    command: SimCreateStackCommand,
    options?: SimCloudFormationRequestOptions,
  ): Promise<SimCreateStackCommandOutput> {
    this.authorization.createStack(command.input.StackName, options?.caller);

    return await new CreateStackCommandHandler({
      simAws: this.simAws,
      accountRegionScope: this.accountRegionScope,
      stacks: this.stacks,
      background: this.background,
      exports: this.exports,
    }).handle(command);
  }

  /**
   * Handle a Describe Stacks Command from the SDK.
   */
  async describeStacks(
    command: SimDescribeStacksCommand,
    options?: SimCloudFormationRequestOptions,
  ): Promise<SimDescribeStacksCommandOutput> {
    this.authorization.describeStacks(command.input.StackName, options?.caller);
    const handler = new DescribeStacksCommandHandler({
      stacks: this.stacks,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle an Update Stack Command from the SDK.
   */
  async updateStack(
    command: SimUpdateStackCommand,
    options?: SimCloudFormationRequestOptions,
  ): Promise<SimUpdateStackCommandOutput> {
    this.authorization.updateStack(command.input.StackName, options?.caller);
    const handler = new UpdateStackCommandHandler({
      simAws: this.simAws,
      accountRegionScope: this.accountRegionScope,
      stacks: this.stacks,
      background: this.background,
      exports: this.exports,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a Delete Stack Command from the SDK.
   */
  async deleteStack(
    command: SimDeleteStackCommand,
    options?: SimCloudFormationRequestOptions,
  ): Promise<SimDeleteStackCommandOutput> {
    this.authorization.deleteStack(command.input.StackName, options?.caller);
    const handler = new DeleteStackCommandHandler({
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
   * Wait for a simulated CloudFormation Stack update operation to complete.
   */
  async waitForStackUpdateComplete(
    stackName: SimCloudFormationStackName | string,
  ): Promise<void> {
    const stack = this.getStackByName(stackName);
    assertDefined(stack, `Sim CloudFormation Stack named ${stackName}`);

    await stack.waitForUpdateComplete();
  }

  /**
   * Wait for a simulated CloudFormation Stack delete operation to complete.
   *
   * A Stack name that is not there has nothing left to wait for: a Stack that
   * finished deleting has already released its name.
   */
  async waitForStackDeleteComplete(
    stackName: SimCloudFormationStackName | string,
  ): Promise<void> {
    await this.getStackByName(stackName)?.waitForDeleteComplete();
  }

  /**
   * Convenience wrapper method to create and deploy a simulated CloudFormation
   * Stack from a parsed template object.
   */
  async deployTemplate(
    properties: SimCloudFormationCreateStackProperties,
  ): Promise<SimCfnDeployedStack> {
    return await this.templateDeployer.deployTemplate(properties);
  }

  /**
   * Convenience wrapper method to create and deploy a simulated CloudFormation
   * Stack from a synthesized CDK template file.
   */
  async deployTemplateFile(
    properties: SimCloudFormationDeployTemplateFileProperties | string,
  ): Promise<SimCfnDeployedStack> {
    return await this.templateDeployer.deployTemplateFile(properties);
  }

  /**
   * Convenience wrapper method to deploy the Stacks a synthesized CDK cloud
   * assembly holds, each into the region its own environment names.
   */
  async deployCdkOut(
    properties: SimCloudFormationDeployCdkOutProperties | string,
  ): Promise<ReadonlyMap<string, SimCfnDeployedStack>> {
    return await this.templateDeployer.deployCdkOut(properties);
  }

  /**
   * Convenience wrapper method to apply a synthesized CDK template file to the
   * simulated CloudFormation Stack it was deployed as.
   *
   * The file is read again, so a template synthesized a second time is applied
   * as the change it is: Resources it adds are created, ones it drops are
   * deleted, and everything else keeps what it holds. Give it what the
   * deployment was given, since parameters are part of what an update applies.
   *
   * Returns once the update has finished, and throws what stopped it if it
   * failed, including the `No updates are to be performed.` a file that was
   * written without being changed is refused with.
   */
  async updateTemplateFile(
    properties: SimCloudFormationDeployTemplateFileProperties | string,
  ): Promise<SimCfnDeployedStack> {
    return await this.templateDeployer.updateTemplateFile(properties);
  }

  /**
   * The template files being watched for changes.
   *
   * A file deployed with `watch` is read again whenever it changes, and the
   * Stack it deployed is updated in place from it.
   */
  watchedTemplateFiles(): readonly string[] {
    return this.templateDeployer.watchedTemplateFiles();
  }

  /**
   * Stop watching template files.
   *
   * A watch holds an open filesystem handle, so a process with one open does
   * not exit on its own. A dev process wants exactly that and never calls this;
   * anything with an end, such as a test, calls it when it is done.
   */
  stopWatchingTemplateFiles(): void {
    this.templateDeployer.stopWatchingTemplateFiles();
  }

  /**
   * Let go of everything this simulated CloudFormation is holding open.
   *
   * The template file watches, which is what `SimAws.close()` reaches to
   * release when a simulated environment is closed as a whole. The Stacks and
   * the resources they deployed are left where they are: this is the open
   * filesystem handles going, not the deployment.
   */
  close(): void {
    this.stopWatchingTemplateFiles();
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
