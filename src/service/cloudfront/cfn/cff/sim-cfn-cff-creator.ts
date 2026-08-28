import { assertDefined } from "../../../../util/type-guard/defined.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";
import type {
  SimCloudFrontFunction,
  SimCloudFrontFunctionName,
} from "../../cff/sim-cloudfront-function.js";
import { SimCfnCffCreateInputBuilder } from "./sim-cfn-cff-create-input-builder.js";
import {
  simCfnResourceCallerOptions,
  type SimCfnResourceCallerOptions,
} from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnCfFunctionCreatorProperties {
  readonly cloudFront: SimCloudFront;
}

/**
 * Creates simulated CloudFront Functions for AWS::CloudFront::Function
 * CloudFormation Resources.
 *
 * This class is only the creation orchestrator:
 *
 * 1. ask SimCfnCffCreateInputBuilder to translate the CloudFormation Resource
 *    properties into the simulated CloudFront CreateFunction input
 * 2. call the simulated CloudFront service
 * 3. read back and return the stored SimCloudFrontFunction instance
 *
 * Keeping the property translation in the input builder keeps this class close
 * to the CloudFormation Resource lifecycle, rather than mixing lifecycle code
 * with template parsing and executable binding selection.
 */
export class SimCfnCffCreator {
  private readonly cloudFront;

  constructor(properties: SimCfnCfFunctionCreatorProperties) {
    this.cloudFront = properties.cloudFront;
  }

  /**
   * Create a simulated CloudFront Function from one resolved
   * AWS::CloudFront::Function Resource.
   *
   * The caller supplies the Resource plus the already-resolved property record.
   * Optional executable bindings come from the CloudFormation create context
   * and allow tests/runtime callers to replace FunctionCode text with an
   * executable handler while preserving CloudFormation-style Resource creation.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    context?: SimCloudFormationResourceCreateContext,
  ): Promise<SimCloudFrontFunction> {
    const inputBuilder = new SimCfnCffCreateInputBuilder({
      resource,
      properties,
      bindings: context?.bindings,
    });
    const functionInput = inputBuilder.build();

    const output = await this.cloudFront.createFunction(
      { input: functionInput },
      simCfnResourceCallerOptions(context?.caller),
    );

    const createdFunctionName = output.FunctionSummary
      .Name as SimCloudFrontFunctionName;
    const cloudFrontFunction =
      this.cloudFront.getCloudFrontFunctionByName(createdFunctionName);

    assertDefined(
      cloudFrontFunction,
      `Expected sim CloudFront Function ${createdFunctionName} to exist after CloudFormation creation`,
    );

    return cloudFrontFunction;
  }

  /**
   * Delete the Function an AWS::CloudFront::Function Resource created.
   */
  async delete(
    resource: SimCfnResource,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const cloudFrontFunction = resource.simResource as
      | SimCloudFrontFunction
      | undefined;
    assertDefined(
      cloudFrontFunction,
      `sim CloudFront Function for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.cloudFront.deleteFunction(
      { input: { Name: cloudFrontFunction.name } },
      options,
    );
  }
}
