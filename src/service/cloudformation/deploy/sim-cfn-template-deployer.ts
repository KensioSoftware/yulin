import type {
  SimCfnStack,
  SimCloudFormationStackName,
} from "../stack/sim-cfn-stack.js";
import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";
import { jsonStringify } from "../../../util/type-guard/json.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCdkOutContext } from "../cdk/sim-cdk-out-context.js";
import { SimCfnTemplateFileLoader } from "./sim-cfn-template-file-loader.js";
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

export interface SimCloudFormationDeployTemplateFileProps {
  readonly templatePath: string;
  readonly stackName?: SimCloudFormationStackName | string | undefined;
  readonly parameters?: Record<string, string> | undefined;
}

interface SimCloudFormationTemplateDeployerProps {
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

  constructor(props: SimCloudFormationTemplateDeployerProps) {
    this.simAws = props.simAws;
    this.accountRegionScope = props.accountRegionScope;
    this.stacks = props.stacks;
    this.background = props.background;
  }

  /**
   * Create and deploy a simulated CloudFormation Stack from a parsed template
   * object.
   */
  async deployTemplate(
    props: SimCloudFormationCreateStackProps,
  ): Promise<SimCfnStack> {
    return await this.deployTemplateWithContext({
      stackName: props.stackName ?? makeSimCloudFormationStackName(),
      template: props.template,
      parameters: props.parameters,
      bindings: props.bindings,
    });
  }

  /**
   * Create and deploy a simulated CloudFormation Stack from a synthesized CDK
   * template file.
   */
  async deployTemplateFile(
    props: SimCloudFormationDeployTemplateFileProps | string,
  ): Promise<SimCfnStack> {
    return await this.deployTemplateWithContext(
      await this.templateFileLoader.load(props),
    );
  }

  private async deployTemplateWithContext(props: {
    readonly stackName: SimCloudFormationStackName | string;
    readonly template: CfnTemplateBodyRecord;
    readonly parameters?: Record<string, string> | undefined;
    readonly bindings?: readonly SimCfnExecutableResourceBinding[] | undefined;
    readonly cdkOutContext?: SimCdkOutContext | undefined;
  }): Promise<SimCfnStack> {
    await this.createStackWithContext(
      {
        input: {
          StackName: props.stackName,
          TemplateBody: jsonStringify(props.template),
          Parameters: Object.entries(props.parameters ?? {}).map(
            ([parameterKey, parameterValue]) => ({
              ParameterKey: parameterKey,
              ParameterValue: parameterValue,
            }),
          ),
        },
      },
      props.cdkOutContext,
      props.bindings,
    );

    const stack = this.stacks.get(
      props.stackName as SimCloudFormationStackName,
    );
    assertDefined(stack, `Sim CloudFormation Stack named ${props.stackName}`);

    await stack.waitForDeployComplete();

    return stack;
  }

  private async createStackWithContext(
    cmd: {
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

    return await handler.handle(cmd);
  }
}

/**
 * Generate a fake CloudFormation Stack name.
 */
function makeSimCloudFormationStackName(): SimCloudFormationStackName {
  return `SimStack${faker.string.alphanumeric({ length: 8 })}` as SimCloudFormationStackName;
}
