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
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../util/background/background.js";
import type { SimCreateStackCommandOutput } from "../command/create-stack/create-stack.command.js";
import { CreateStackCommandHandler } from "../command/create-stack/create-stack.handler.js";
import { faker } from "@faker-js/faker";
import type { SimCfnExports } from "../export/sim-cfn-exports.js";

export interface SimCloudFormationCreateStackProperties {
  readonly stackName?: SimCloudFormationStackName | string;
  readonly template: CfnTemplateBodyRecord;
  readonly parameters?: Record<string, string> | undefined;
  readonly bindings?: readonly SimCfnBinding[] | undefined;

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

  private async deployTemplateWithContext(properties: {
    readonly stackName: SimCloudFormationStackName | string;
    readonly template: CfnTemplateBodyRecord;
    readonly parameters?: Record<string, string> | undefined;
    readonly bindings?: readonly SimCfnBinding[] | undefined;
    readonly cdkOutContext?: SimCdkOutContext | undefined;
  }): Promise<SimCfnDeployedStack> {
    await this.createStackWithContext(
      {
        input: {
          StackName: properties.stackName,
          TemplateBody: jsonStringify(properties.template),
          Parameters: Object.entries(properties.parameters ?? {}).map(
            ([parameterKey, parameterValue]) => ({
              ParameterKey: parameterKey,
              ParameterValue: parameterValue,
            }),
          ),
        },
      },
      properties.cdkOutContext,
      properties.bindings,
    );

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
    command: {
      readonly input: {
        readonly StackName: SimCloudFormationStackName | string;
        readonly TemplateBody: string;
        readonly Parameters: readonly {
          readonly ParameterKey: string;
          readonly ParameterValue: string;
        }[];
      };
    },
    cdkOutContext?: SimCdkOutContext,
    bindings?: readonly SimCfnBinding[],
  ): Promise<SimCreateStackCommandOutput> {
    const handler = new CreateStackCommandHandler({
      simAws: this.simAws,
      accountRegionScope: this.accountRegionScope,
      stacks: this.stacks,
      background: this.background,
      cdkOutContext,
      bindings,
      exports: this.exports,
    });

    return await handler.handle(command);
  }
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
