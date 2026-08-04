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
import { SimCfnConditionEvaluator } from "./condition/sim-cfn-condition-evaluator.js";
import type {
  SimCfnConditions,
  SimCfnConditionsSection,
} from "./condition/sim-cfn-conditions.js";
import { SimCfnResourceConditions } from "./condition/sim-cfn-resource-conditions.js";

/**
 * Parsed CloudFormation template body accepted by the simulator.
 *
 * Yulin accepts already-parsed templates and does not parse JSON or YAML itself.
 */
export interface CfnTemplateBodyRecord {
  readonly Parameters?: Record<string, SimCfnParameterDefinition> | undefined;
  readonly Mappings?: SimCfnMappings | undefined;
  readonly Conditions?: SimCfnConditionsSection | undefined;
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
  private evaluatedConditions: SimCfnConditions | undefined;

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
   *
   * A Resource whose `Condition` attribute is false is left out entirely, so
   * the Stack never has a Resource the template conditioned out.
   */
  resourceTemplates(): SimCfnResourceTemplateRecord[] {
    const valueResolver = this.valueResolver();
    const resourceConditions = new SimCfnResourceConditions({
      resources: this.template.Resources,
      conditions: this.conditions(),
      stackName: this.stackName,
    });

    const resourceTemplates = Object.entries(this.template.Resources)
      .filter((entry): entry is [string, SimCfnTemplateValueRecord] => {
        return isRecord(entry[1]);
      })
      .filter(([logicalId]) => !resourceConditions.excludes(logicalId))
      .map(([logicalId, resourceTemplate]) => ({
        logicalId,
        template: valueResolver.resolveRecordFor(
          `Sim CloudFormation Resource ${logicalId}`,
          resourceTemplate,
        ),
      }));

    resourceConditions.assertNotReferenced(resourceTemplates);

    return resourceTemplates;
  }

  /**
   * Get Output template entries with parameter-only expressions resolved.
   *
   * Resource-backed intrinsic functions are left unresolved here because
   * Outputs are resolved after Resource creation.
   */
  outputTemplates(): SimCfnOutputTemplateRecord[] {
    const valueResolver = this.valueResolver();

    return Object.entries(this.template.Outputs ?? {})
      .filter((entry): entry is [string, SimCfnTemplateValueRecord] => {
        return isRecord(entry[1]);
      })
      .map(([outputKey, outputTemplate]) => ({
        outputKey,
        template: valueResolver.resolveRecordFor(
          `Sim CloudFormation Output ${outputKey}`,
          outputTemplate,
        ),
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

  /**
   * Get the template Conditions, evaluated against this Stack's Parameters.
   *
   * A Condition reads only Parameters and pseudo parameters, so the section is
   * evaluated once and the answers reused by every Resource and Output.
   */
  conditions(): SimCfnConditions {
    this.evaluatedConditions ??= new SimCfnConditionEvaluator({
      conditions: this.template.Conditions,
      stackName: this.stackName,
      valueResolver: new SimCfnTemplateValueResolver({
        parameters: this.parameters,
        pseudoParameters: this.pseudoParameters(),
        mappings: this.template.Mappings,
      }),
    }).evaluate();

    return this.evaluatedConditions;
  }

  private valueResolver(): SimCfnTemplateValueResolver {
    return new SimCfnTemplateValueResolver({
      parameters: this.parameters,
      pseudoParameters: this.pseudoParameters(),
      mappings: this.template.Mappings,
      conditions: this.conditions(),
    });
  }
}
