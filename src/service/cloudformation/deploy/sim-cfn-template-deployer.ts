import type {
  SimCfnStack,
  SimCloudFormationStackName,
} from "../stack/sim-cfn-stack.js";
import type { SimCreateStackCommandOutput } from "../command/create-stack/create-stack.cmd.js";
import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";
import { jsonStringify } from "../../../util/type-guard/json.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCdkOutContext } from "../cdk/sim-cdk-out-context.js";
import { SimCfnTemplateFileLoader } from "./sim-cfn-template-file-loader.js";

export interface SimCloudFormationCreateStackProps {
  readonly stackName?: SimCloudFormationStackName | string;
  readonly template: CfnTemplateBodyRecord;
  readonly parameters?: Record<string, string> | undefined;
}

export interface SimCloudFormationDeployTemplateFileProps {
  readonly templatePath: string;
  readonly stackName?: SimCloudFormationStackName | string | undefined;
  readonly parameters?: Record<string, string> | undefined;
}

interface SimCloudFormationTemplateDeployerProps {
  readonly createStackWithContext: (
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
  ) => Promise<SimCreateStackCommandOutput>;
  readonly getStackByName: (
    stackName: SimCloudFormationStackName | string,
  ) => SimCfnStack | undefined;
  readonly defaultStackName: () => SimCloudFormationStackName;
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
  private readonly templateFileLoader = new SimCfnTemplateFileLoader();

  constructor(private readonly props: SimCloudFormationTemplateDeployerProps) {}

  /**
   * Create and deploy a simulated CloudFormation Stack from a parsed template
   * object.
   */
  async deployTemplate(
    props: SimCloudFormationCreateStackProps,
  ): Promise<SimCfnStack> {
    return await this.deployTemplateWithContext({
      stackName: props.stackName ?? this.props.defaultStackName(),
      template: props.template,
      parameters: props.parameters,
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
    readonly cdkOutContext?: SimCdkOutContext | undefined;
  }): Promise<SimCfnStack> {
    await this.props.createStackWithContext(
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
    );

    const stack = this.props.getStackByName(props.stackName);
    assertDefined(stack, `Sim CloudFormation Stack named ${props.stackName}`);

    await stack.waitForDeployComplete();

    return stack;
  }
}
