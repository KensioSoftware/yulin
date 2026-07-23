import { SimCfnParameters } from "../parameters/sim-cfn-parameters.js";
import { SimCfnTemplateValueResolver } from "./value/sim-cfn-template-value-resolver.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "./value/sim-cfn-template-value.js";
import { isRecord } from "../../../util/type-guard/record.js";
import { SimCfnTemplateBodyValidator } from "./sim-cfn-template-body-validator.js";
import type { SimCfnParameterDefinition } from "../parameters/sim-cfn-parameters.type.js";
import { jsonParse, type JSONString } from "../../../util/type-guard/json.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimCfnPseudoParameters } from "../parameters/pseudo/sim-cfn-pseudo-parameters.js";
import type { SimCfnMappings } from "./mapping/sim-cfn-mappings.js";

/**
 * Parsed CloudFormation template body accepted by the simulator.
 *
 * Yulin accepts already-parsed templates and does not parse JSON or YAML itself.
 */
export interface CfnTemplateBodyRecord {
  readonly Parameters?: Record<string, SimCfnParameterDefinition> | undefined;
  readonly Mappings?: SimCfnMappings | undefined;
  readonly Resources: Record<string, SimCfnTemplateValue>;
  readonly Outputs?: Record<string, SimCfnTemplateValue> | undefined;
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

export interface SimCfnOutputTemplateRecord {
  readonly outputKey: string;
  readonly template: SimCfnTemplateValueRecord;
}

interface SimCfnTemplateProperties {
  readonly template: CfnTemplateBodyRecord;
  readonly parameters?: SimCfnParameters | undefined;
  readonly stackName?: string | undefined;
  readonly accountRegionScope?: SimAwsAccountRegionScope | undefined;
}

interface SimCfnTemplateFromJsonProperties {
  readonly stackName?: string | undefined;
  readonly parameters?: SimCfnParameters | undefined;
  readonly accountRegionScope?: SimAwsAccountRegionScope | undefined;
}

/**
 * Convenience wrapper over a plain parsed CloudFormation template object.
 *
 * This keeps template interpretation logic out of Stack lifecycle classes.
 */
export class SimCfnTemplate {
  public readonly template: CfnTemplateBodyRecord;
  public readonly stackName: string | undefined;
  public readonly parameters: SimCfnParameters;
  private readonly accountRegionScope: SimAwsAccountRegionScope | undefined;

  constructor(properties: SimCfnTemplateProperties) {
    const { template, parameters, stackName, accountRegionScope } = properties;

    this.template = template;
    this.stackName = stackName;
    this.accountRegionScope = accountRegionScope;

    const validator = new SimCfnTemplateBodyValidator({ template, stackName });
    validator.validate();

    this.parameters = (
      parameters ?? new SimCfnParameters({ stackName })
    ).withDefinitions(this.template.Parameters);
  }

  /**
   * Parse a JSON CloudFormation template body.
   */
  static fromJson(
    templateBody: JSONString<CfnTemplateBodyRecord>,
    properties: SimCfnTemplateFromJsonProperties = {},
  ): SimCfnTemplate {
    let template: CfnTemplateBodyRecord;

    try {
      template = jsonParse(templateBody);
    } catch (error) {
      throw new Error(
        `Sim CloudFormation Stack ${properties.stackName ?? "unknown"} TemplateBody must be valid JSON`,
        {
          cause: error,
        },
      );
    }

    return new SimCfnTemplate({
      template,
      parameters: properties.parameters,
      stackName: properties.stackName,
      accountRegionScope: properties.accountRegionScope,
    });
  }

  /**
   * Get Resource template entries with CloudFormation value expressions resolved.
   *
   * Parameters and parameter-only intrinsic functions are resolved here.
   * Refs to other Resources are left unresolved because the referenced Resources do not exist yet; they are resolved at Resource creation time.
   */
  resourceTemplates(): SimCfnResourceTemplateRecord[] {
    const valueResolver = new SimCfnTemplateValueResolver({
      parameters: this.parameters,
      pseudoParameters: this.pseudoParameters(),
      mappings: this.template.Mappings,
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

  /**
   * Get Output template entries with parameter-only expressions resolved.
   *
   * Resource-backed intrinsic functions are left unresolved here because
   * Outputs are resolved after Resource creation.
   */
  outputTemplates(): SimCfnOutputTemplateRecord[] {
    const valueResolver = new SimCfnTemplateValueResolver({
      parameters: this.parameters,
      pseudoParameters: this.pseudoParameters(),
      mappings: this.template.Mappings,
    });

    return Object.entries(this.template.Outputs ?? {})
      .filter((entry): entry is [string, SimCfnTemplateValueRecord] => {
        return isRecord(entry[1]);
      })
      .map(([outputKey, outputTemplate]) => ({
        outputKey,
        template: valueResolver.resolveRecord(outputTemplate),
      }));
  }

  /**
   * Get the sim CFN pseudo parameters for this template.
   *
   * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/pseudo-parameter-reference.html
   */
  pseudoParameters(): SimCfnPseudoParameters {
    return new SimCfnPseudoParameters({
      accountRegionScope: this.accountRegionScope,
      stackName: this.stackName,
    });
  }
}
