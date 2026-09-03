import type {
  SimCfnStack,
  SimCloudFormationStackName,
} from "../stack/sim-cfn-stack.js";
import type { SimCfnDeployedStack } from "../stack/sim-cfn-deployed-stack.type.js";
import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";
import { jsonStringify } from "../../../util/type-guard/json.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import {
  loadSiblingCdkAssetsManifest,
  type SimCdkOutContext,
} from "../cdk/sim-cdk-out-context.js";
import {
  SimCfnTemplateFileLoader,
  type SimCloudFormationDeployTemplateFileProperties as SimCloudFormationDeployTemplateFileProperties,
} from "./sim-cfn-template-file-loader.js";
import { SimCfnTemplateFileUpdater } from "./sim-cfn-template-file-updater.js";
import {
  SimCfnCdkOutDeployer,
  type SimCloudFormationDeployCdkOutProperties,
} from "./sim-cfn-cdk-out-deployer.js";
import { simCfnTemplateFileDeployment } from "./sim-cfn-template-file-deployment.js";
import { SimCfnTemplateFileWatches } from "../watch/sim-cfn-template-file-watches.js";
import type { SimCfnBinding } from "../bind/sim-cfn-binding.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../util/background/background.js";
import type { SimCreateStackCommandOutput } from "../command/create-stack/create-stack.command.js";
import { CreateStackCommandHandler } from "../command/create-stack/create-stack.handler.js";
import { faker } from "@faker-js/faker";
import type { SimCfnExports } from "../export/sim-cfn-exports.js";
import type { SimCfnResourceOrder } from "../stack/deploy/sim-cfn-resource-order.js";

export interface SimCloudFormationCreateStackProperties {
  readonly stackName?: SimCloudFormationStackName | string;
  readonly template: CfnTemplateBodyRecord;
  readonly parameters?: Record<string, string> | undefined;
  readonly bindings?: readonly SimCfnBinding[] | undefined;

  /**
   * The principal the deployment runs as.
   *
   * Every Resource is created, updated and deleted through the command an SDK
   * caller would reach, and this is who those commands are authorized as. Left
   * out, they are decided as the Account root, which is what a service control
   * policy denying an Account's root principal then denies.
   */
  readonly caller?: SimAwsCaller | undefined;

  /**
   * The principal the CDK file assets staged beside the template are published
   * as.
   *
   * A real `cdk deploy` publishes them as the file publishing Role and only
   * then processes the template as the execution Role, which is why the two
   * are named apart. Left out, assets are published as `caller`.
   */
  readonly assetsCaller?: SimAwsCaller | undefined;

  /**
   * The order Resources with no dependency between them are created in.
   *
   * CloudFormation is free to create them either way round, and the template's
   * own order is what a deployment does by default. `reversed` starts each
   * dependency batch from its last Resource, so a Stack that only deploys in
   * the order its template happens to be written fails here rather than in the
   * account. Declared dependencies and `DependsOn` are honoured either way.
   */
  readonly resourceOrder?: SimCfnResourceOrder | undefined;

  /**
   * The synthesized CDK template file this in-memory template stands in for.
   *
   * The file itself is not read as the template: the given `template` object is
   * what gets deployed. Only the file's directory and its sibling CDK assets
   * manifest are loaded, so a template edited in memory can still resolve
   * staged assets from the cloud assembly it came from.
   */
  readonly templatePath?: string | undefined;
}

export type { SimCloudFormationDeployTemplateFileProperties } from "./sim-cfn-template-file-loader.js";

interface SimCloudFormationTemplateDeployerProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  readonly background: BackgroundScheduler & BackgroundCompleter;
  readonly exports?: SimCfnExports | undefined;
}

/**
 * Deploys parsed or synthesized CloudFormation templates into simulated stacks.
 *
 * This class owns the convenience deployment workflow around the core
 * CreateStack command:
 * - choose or infer a Stack name;
 * - submit CreateStack;
 * - wait for completion;
 * - return the created Stack.
 */
export class SimCloudFormationTemplateDeployer {
  private readonly simAws: SimAws;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  private readonly background: BackgroundScheduler & BackgroundCompleter;
  private readonly exports: SimCfnExports | undefined;
  private readonly templateFileLoader = new SimCfnTemplateFileLoader();
  private readonly templateFileUpdater: SimCfnTemplateFileUpdater;
  private readonly cdkOutDeployer: SimCfnCdkOutDeployer;
  private readonly watches: SimCfnTemplateFileWatches;

  constructor(properties: SimCloudFormationTemplateDeployerProperties) {
    this.simAws = properties.simAws;
    this.accountRegionScope = properties.accountRegionScope;
    this.stacks = properties.stacks;
    this.background = properties.background;
    this.exports = properties.exports;
    this.templateFileUpdater = new SimCfnTemplateFileUpdater({
      simAws: this.simAws,
      accountRegionScope: this.accountRegionScope,
      stacks: this.stacks,
      background: this.background,
    });
    this.watches = new SimCfnTemplateFileWatches({
      updater: this.templateFileUpdater,
    });
    this.cdkOutDeployer = new SimCfnCdkOutDeployer({
      simAws: this.simAws,
      accountRegionScope: this.accountRegionScope,
    });
  }

  /**
   * Create and deploy a simulated CloudFormation Stack from a parsed template
   * object.
   */
  async deployTemplate(
    properties: SimCloudFormationCreateStackProperties,
  ): Promise<SimCfnDeployedStack> {
    return await this.deployTemplateWithContext({
      stackName: properties.stackName ?? makeSimCloudFormationStackName(),
      template: properties.template,
      parameters: properties.parameters,
      bindings: properties.bindings,
      caller: properties.caller,
      assetsCaller: properties.assetsCaller,
      resourceOrder: properties.resourceOrder,
      cdkOutContext: await cdkOutContextForTemplatePath(
        properties.templatePath,
      ),
    });
  }

  /**
   * Create and deploy a simulated CloudFormation Stack from a synthesized CDK
   * template file.
   *
   * A deployment asked to watch the file starts watching once the Stack is
   * deployed, so a template that could not be deployed at all is not one this
   * keeps trying to update.
   */
  async deployTemplateFile(
    properties: SimCloudFormationDeployTemplateFileProperties | string,
  ): Promise<SimCfnDeployedStack> {
    const deployment = simCfnTemplateFileDeployment(properties);
    const stack = await this.deployTemplateWithContext(
      await this.templateFileLoader.load(deployment),
    );

    this.watches.watchIfAsked(deployment);

    return stack;
  }

  /**
   * Deploy the Stacks a synthesized CDK cloud assembly holds.
   */
  async deployCdkOut(
    properties: SimCloudFormationDeployCdkOutProperties | string,
  ): Promise<ReadonlyMap<string, SimCfnDeployedStack>> {
    return await this.cdkOutDeployer.deploy(properties);
  }

  /**
   * Apply a synthesized CDK template file to the Stack it was deployed as, and
   * wait for the Resource work to finish.
   */
  async updateTemplateFile(
    properties: SimCloudFormationDeployTemplateFileProperties | string,
  ): Promise<SimCfnDeployedStack> {
    return await this.templateFileUpdater.update(
      simCfnTemplateFileDeployment(properties),
    );
  }

  /**
   * The template files being watched for changes.
   */
  watchedTemplateFiles(): readonly string[] {
    return this.watches.paths();
  }

  /**
   * Stop watching every template file being watched.
   */
  stopWatchingTemplateFiles(): void {
    this.watches.stopAll();
  }

  private async deployTemplateWithContext(
    properties: SimCfnTemplateDeployment,
  ): Promise<SimCfnDeployedStack> {
    await this.createStackWithContext(properties);

    const stack = this.stacks.get(
      properties.stackName as SimCloudFormationStackName,
    );
    assertDefined(
      stack,
      `Sim CloudFormation Stack named ${properties.stackName}`,
    );

    await stack.waitForDeployComplete();

    return stack;
  }

  private async createStackWithContext(
    deployment: SimCfnTemplateDeployment,
  ): Promise<SimCreateStackCommandOutput> {
    const handler = new CreateStackCommandHandler({
      simAws: this.simAws,
      accountRegionScope: this.accountRegionScope,
      stacks: this.stacks,
      background: this.background,
      cdkOutContext: deployment.cdkOutContext,
      bindings: deployment.bindings,
      caller: deployment.caller,
      assetsCaller: deployment.assetsCaller,
      resourceOrder: deployment.resourceOrder,
      exports: this.exports,
    });

    return await handler.handle({
      input: {
        StackName: deployment.stackName,
        TemplateBody: jsonStringify(deployment.template),
        Parameters: Object.entries(deployment.parameters ?? {}).map(
          ([parameterKey, parameterValue]) => ({
            ParameterKey: parameterKey,
            ParameterValue: parameterValue,
          }),
        ),
      },
    });
  }
}

/** One template on its way into a Stack, with everything it deploys with. */
interface SimCfnTemplateDeployment {
  readonly stackName: SimCloudFormationStackName | string;
  readonly template: CfnTemplateBodyRecord;
  readonly parameters?: Record<string, string> | undefined;
  readonly bindings?: readonly SimCfnBinding[] | undefined;
  readonly caller?: SimAwsCaller | undefined;
  readonly assetsCaller?: SimAwsCaller | undefined;
  readonly resourceOrder?: SimCfnResourceOrder | undefined;
  readonly cdkOutContext?: SimCdkOutContext | undefined;
}

/**
 * Load the CDK cloud assembly context a template deployed from memory points
 * at, if it points at one at all.
 */
async function cdkOutContextForTemplatePath(
  templatePath: string | undefined,
): Promise<SimCdkOutContext | undefined> {
  if (templatePath === undefined) {
    return undefined;
  }

  return await loadSiblingCdkAssetsManifest(templatePath);
}

/**
 * Generate a fake CloudFormation Stack name.
 */
function makeSimCloudFormationStackName(): SimCloudFormationStackName {
  return `SimStack${faker.string.alphanumeric({ length: 8 })}` as SimCloudFormationStackName;
}
