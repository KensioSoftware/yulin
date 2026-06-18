import { SimCfnParameters } from "../parameters/sim-cfn-parameters.js";
import { resolveSimCfnTemplateParamRefs } from "./sim-cfn-template-param-refs.js";
import { isRecord } from "../../../util/type-guard/record.js";

/**
 * Parsed CloudFormation template body accepted by the simulator.
 *
 * Yulin accepts already-parsed templates and does not parse JSON or YAML itself.
 */
export interface CfnTemplateBodyRecord {
  readonly Parameters?: Record<string, unknown> | undefined;
  readonly Resources: Record<string, unknown>;
  readonly [sectionName: string]: unknown;
}

export interface SimCfnResourceTemplateRecord {
  readonly logicalId: string;
  readonly template: Record<string, unknown>;
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
  private readonly parameters: SimCfnParameters;
  private readonly stackName: string | undefined;

  constructor(props: SimCfnTemplateProps) {
    const { template, parameters, stackName } = props;

    this.template = template;
    this.stackName = stackName;

    this.validateTemplateBody();

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
    let template: unknown;

    try {
      template = JSON.parse(templateBody);
    } catch (error) {
      throw new Error(
        `Sim CloudFormation Stack ${props.stackName ?? "unknown"} TemplateBody must be valid JSON`,
        {
          cause: error,
        },
      );
    }

    return new SimCfnTemplate({
      template: template as CfnTemplateBodyRecord,
      parameters: props.parameters,
      stackName: props.stackName,
    });
  }

  /**
   * Get Resource template entries with CloudFormation Parameter refs resolved.
   */
  resourceTemplates(): SimCfnResourceTemplateRecord[] {
    return Object.entries(this.template.Resources)
      .filter((entry): entry is [string, Record<string, unknown>] => {
        return isRecord(entry[1]);
      })
      .map(([logicalId, resourceTemplate]) => ({
        logicalId,
        template: resolveSimCfnTemplateParamRefs(
          resourceTemplate,
          this.parameters,
        ),
      }));
  }

  private validateTemplateBody(): void {
    if (!isRecord(this.template)) {
      throw new Error(
        `Sim CloudFormation Stack ${this.stackNameLabel()} TemplateBody must parse to an object`,
      );
    }

    if (!("Resources" in this.template)) {
      throw new Error(
        `Sim CloudFormation Stack ${this.stackNameLabel()} TemplateBody must include a Resources object`,
      );
    }

    if (!isRecord(this.template.Resources)) {
      throw new Error(
        `Sim CloudFormation Stack ${this.stackNameLabel()} TemplateBody Resources must be an object`,
      );
    }

    if (
      this.template.Parameters !== undefined &&
      !isRecord(this.template.Parameters)
    ) {
      throw new Error(
        `Sim CloudFormation Stack ${this.stackNameLabel()} Parameters must be an object`,
      );
    }
  }

  private stackNameLabel(): string {
    return this.stackName ?? "unknown";
  }
}
