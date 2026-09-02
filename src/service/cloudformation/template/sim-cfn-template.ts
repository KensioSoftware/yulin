import { SimCfnParameters } from "../parameters/sim-cfn-parameters.js";
import { SimCfnTemplateValueResolver } from "./value/sim-cfn-template-value-resolver.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "./value/sim-cfn-template-value.js";
import { isRecord } from "../../../util/type-guard/record.js";
import { SimCfnTemplateBodyValidator } from "./sim-cfn-template-body-validator.js";
import type { SimCfnParameterDefinition } from "../parameters/sim-cfn-parameters.type.js";
import { parseSimCfnTemplateBody } from "./sim-cfn-template-body-parse.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimCfnPseudoParameters } from "../parameters/pseudo/sim-cfn-pseudo-parameters.js";
import type { SimCfnMappings } from "./mapping/sim-cfn-mappings.js";
import { SimCfnConditionEvaluator } from "./condition/sim-cfn-condition-evaluator.js";
import type {
  SimCfnConditions,
  SimCfnConditionsSection,
} from "./condition/sim-cfn-conditions.js";
import { SimCfnOutputConditions } from "./condition/sim-cfn-output-conditions.js";
import { SimCfnResourceConditions } from "./condition/sim-cfn-resource-conditions.js";
import type { SimCfnExports } from "../export/sim-cfn-exports.js";
import { samExpandedTemplate } from "../sam/sim-cfn-sam-expansion.js";

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
  readonly stackId?: string | undefined;
  readonly accountRegionScope?: SimAwsAccountRegionScope | undefined;
  readonly exports?: SimCfnExports | undefined;
}

interface SimCfnTemplateFromBodyProperties {
  readonly stackName?: string | undefined;
  readonly stackId?: string | undefined;
  readonly parameters?: SimCfnParameters | undefined;
  readonly accountRegionScope?: SimAwsAccountRegionScope | undefined;
  readonly exports?: SimCfnExports | undefined;
}

/**
 * Convenience wrapper over a plain parsed CloudFormation template object.
 *
 * This keeps template interpretation logic out of Stack lifecycle classes.
 */
export class SimCfnTemplate {
  public readonly template: CfnTemplateBodyRecord;
  public readonly stackName: string | undefined;
  /** The unique ID of the Stack this template is being deployed as. */
  public readonly stackId: string | undefined;
  public readonly parameters: SimCfnParameters;
  /** The export names a Stack deployed from this template can import. */
  public readonly exports: SimCfnExports | undefined;
  private readonly accountRegionScope: SimAwsAccountRegionScope | undefined;
  private evaluatedConditions: SimCfnConditions | undefined;

  constructor(properties: SimCfnTemplateProperties) {
    const {
      template,
      parameters,
      stackName,
      stackId,
      accountRegionScope,
      exports,
    } = properties;

    this.template = template;
    this.stackName = stackName;
    this.stackId = stackId;
    this.accountRegionScope = accountRegionScope;
    this.exports = exports;

    const validator = new SimCfnTemplateBodyValidator({ template, stackName });
    validator.validate();

    this.parameters = (
      parameters ?? new SimCfnParameters({ stackName })
    ).withDefinitions(this.template.Parameters);
  }

  /**
   * Parse a CloudFormation template body written as JSON or as YAML.
   *
   * This is the `TemplateBody` a Stack command carries, in either of the two
   * formats CloudFormation takes it in.
   *
   * A template naming the SAM transform is expanded on the way through, so
   * what the Stack is deployed from holds the Resource types simulated AWS
   * creates rather than the `AWS::Serverless::*` ones the author wrote. That
   * holds for a YAML template as it does for a JSON one.
   */
  static fromTemplateBody(
    templateBody: string,
    properties: SimCfnTemplateFromBodyProperties = {},
  ): SimCfnTemplate {
    const template = parseSimCfnTemplateBody(templateBody, {
      stackName: properties.stackName,
    });

    return new SimCfnTemplate({
      template: samExpandedTemplate(template),
      parameters: properties.parameters,
      stackName: properties.stackName,
      stackId: properties.stackId,
      accountRegionScope: properties.accountRegionScope,
      exports: properties.exports,
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
   *
   * An Output whose `Condition` attribute is false is left out entirely, so it
   * never reaches the Stack's Outputs and publishes no export.
   */
  outputTemplates(): SimCfnOutputTemplateRecord[] {
    const valueResolver = this.valueResolver();
    const outputConditions = new SimCfnOutputConditions({
      conditions: this.conditions(),
      stackName: this.stackName,
    });

    return Object.entries(this.template.Outputs ?? {})
      .filter((entry): entry is [string, SimCfnTemplateValueRecord] => {
        return isRecord(entry[1]);
      })
      .filter(
        ([outputKey, outputTemplate]) =>
          !outputConditions.excludes(outputKey, outputTemplate),
      )
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
      stackId: this.stackId,
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
        exports: this.exports,
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
      exports: this.exports,
    });
  }
}
