import type {
  SimCfnStack,
  SimCloudFormationStackName,
} from "../stack/sim-cfn-stack.js";
import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";
import { jsonStringify } from "../../../util/type-guard/json.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCdkOutContext } from "../cdk/sim-cdk-out-context.js";
import {
  SimCfnTemplateFileLoader,
  type SimCloudFormationDeployTemplateFileProps as SimCloudFormationDeployTemplateFileProperties,
} from "./sim-cfn-template-file-loader.js";
import type { SimCfnExecutableResourceBinding } from "../bind/sim-cfn-exec-binding.type.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../util/background/background.js";
import type { SimCreateStackCommandOutput } from "../command/create-stack/create-stack.cmd.js";
import { CreateStackCommandHandler } from "../command/create-stack/create-stack.handler.js";
import { faker } from "@faker-js/faker";

export interface SimCloudFormationCreateStackProps {
  readonly stackName?: SimCloudFormationStackName | string;
  readonly template: CfnTemplateBodyRecord;
  readonly parameters?: Record<string, string> | undefined;
  readonly bindings?: readonly SimCfnExecutableResourceBinding[] | undefined;
}

export type { SimCloudFormationDeployTemplateFileProps } from "./sim-cfn-template-file-loader.js";

interface SimCloudFormationTemplateDeployerProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  readonly background: BackgroundScheduler & BackgroundCompleter;
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
  private readonly templateFileLoader = new SimCfnTemplateFileLoader();

  constructor(properties: SimCloudFormationTemplateDeployerProperties) {
    this.simAws = properties.simAws;
    this.accountRegionScope = properties.accountRegionScope;
    this.stacks = properties.stacks;
    this.background = properties.background;
  }

  /**
   * Create and deploy a simulated CloudFormation Stack from a parsed template
   * object.
   */
  async deployTemplate(
    properties: SimCloudFormationCreateStackProps,
  ): Promise<SimCfnStack> {
    return await this.deployTemplateWithContext({
      stackName: properties.stackName ?? makeSimCloudFormationStackName(),
      template: properties.template,
      parameters: properties.parameters,
      bindings: properties.bindings,
    });
  }

  /**
   * Create and deploy a simulated CloudFormation Stack from a synthesized CDK
   * template file.
   */
  async deployTemplateFile(
    properties: SimCloudFormationDeployTemplateFileProperties | string,
  ): Promise<SimCfnStack> {
    return await this.deployTemplateWithContext(
      await this.templateFileLoader.load(properties),
    );
  }

  private async deployTemplateWithContext(properties: {
    readonly stackName: SimCloudFormationStackName | string;
    readonly template: CfnTemplateBodyRecord;
    readonly parameters?: Record<string, string> | undefined;
    readonly bindings?: readonly SimCfnExecutableResourceBinding[] | undefined;
    readonly cdkOutContext?: SimCdkOutContext | undefined;
  }): Promise<SimCfnStack> {
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

/**
 * Generate a fake CloudFormation Stack name.
 */
function makeSimCloudFormationStackName(): SimCloudFormationStackName {
  return `SimStack${faker.string.alphanumeric({ length: 8 })}` as SimCloudFormationStackName;
}
