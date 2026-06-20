import { SimCfnParameters } from "../parameters/sim-cfn-parameters.js";
import { SimCfnTemplateValueResolver } from "./value/sim-cfn-template-value-resolver.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "./value/sim-cfn-template-value.js";
import { isRecord } from "../../../util/type-guard/record.js";
import { SimCfnTemplateBodyValidator } from "./sim-cfn-template-body-validator.js";
import type { SimCfnParameterDefinition } from "../parameters/sim-cfn-parameters.type.js";

/**
 * Parsed CloudFormation template body accepted by the simulator.
 *
 * Yulin accepts already-parsed templates and does not parse JSON or YAML itself.
 */
export interface CfnTemplateBodyRecord {
  readonly Parameters?: Record<string, SimCfnParameterDefinition> | undefined;
  readonly Resources: Record<string, SimCfnTemplateValue>;
  readonly [sectionName: string]:
    | Record<string, SimCfnParameterDefinition>
    | Record<string, SimCfnTemplateValue>
    | SimCfnTemplateValue
    | undefined;
}

export interface SimCfnResourceTemplateRecord {
  readonly logicalId: string;
  readonly template: SimCfnTemplateValueRecord;
}

interface SimCfnTemplateProps {
  readonly template: CfnTemplateBodyRecord;
  readonly parameters?: SimCfnParameters | undefined;
  readonly stackName?: string | undefined;
}

interface SimCfnTemplateFromJsonProps {
  readonly stackName?: string | undefined;
  readonly parameters?: SimCfnParameters | undefined;
}

/**
 * Convenience wrapper over a plain parsed CloudFormation template object.
 *
 * This keeps template interpretation logic out of Stack lifecycle classes.
 */
export class SimCfnTemplate {
  public readonly template: CfnTemplateBodyRecord;
  public readonly stackName: string | undefined;
  private readonly parameters: SimCfnParameters;

  constructor(props: SimCfnTemplateProps) {
    const { template, parameters, stackName } = props;

    this.template = template;
    this.stackName = stackName;

    new SimCfnTemplateBodyValidator({ template, stackName }).validate();

    this.parameters = (
      parameters ?? new SimCfnParameters({ stackName })
    ).withDefinitions(this.template.Parameters);
  }

  /**
   * Parse a JSON CloudFormation template body.
   */
  static fromJson(
    templateBody: string,
    props: SimCfnTemplateFromJsonProps = {},
  ): SimCfnTemplate {
    let template: CfnTemplateBodyRecord;

    try {
      template = JSON.parse(templateBody) as CfnTemplateBodyRecord;
    } catch (error) {
      throw new Error(
        `Sim CloudFormation Stack ${props.stackName ?? "unknown"} TemplateBody must be valid JSON`,
        {
          cause: error,
        },
      );
    }

    return new SimCfnTemplate({
      template,
      parameters: props.parameters,
      stackName: props.stackName,
    });
  }

  /**
   * Get Resource template entries with CloudFormation value expressions resolved.
   */
  resourceTemplates(): SimCfnResourceTemplateRecord[] {
    const valueResolver = new SimCfnTemplateValueResolver({
      parameters: this.parameters,
    });

    return Object.entries(this.template.Resources)
      .filter((entry): entry is [string, SimCfnTemplateValueRecord] => {
        return isRecord(entry[1]);
      })
      .map(([logicalId, resourceTemplate]) => ({
        logicalId,
        template: valueResolver.resolveRecord(resourceTemplate),
      }));
  }
}
