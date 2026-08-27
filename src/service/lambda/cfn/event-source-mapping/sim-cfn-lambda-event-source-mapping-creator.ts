import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLambdaEventSourceMapping } from "../../event-source/sim-lambda-event-source-mapping.js";
import type { SimLambda } from "../../sim-lambda.js";
import { SimCfnLambdaEventSourceMappingProperties } from "./sim-cfn-lambda-event-source-mapping-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnLambdaEventSourceMappingCreatorProperties {
  readonly lambda: SimLambda;
}

/**
 * Creates simulated event source mappings from CloudFormation Resources.
 *
 * This is what CDK's `fn.addEventSource(new SqsEventSource(queue))` emits, so a
 * synthesized template is the usual way a mapping comes into existence outside
 * a direct SDK call. The mapping is created through the ordinary
 * CreateEventSourceMapping command, so a template deploying one gets the same
 * execution-role check an SDK caller would.
 */
export class SimCfnLambdaEventSourceMappingCreator {
  private readonly lambda: SimLambda;

  constructor(properties: SimCfnLambdaEventSourceMappingCreatorProperties) {
    this.lambda = properties.lambda;
  }

  /**
   * Create a mapping from an AWS::Lambda::EventSourceMapping Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimLambdaEventSourceMapping> {
    const created = await this.lambda.createEventSourceMapping(
      {
        input: new SimCfnLambdaEventSourceMappingProperties({
          resource,
          properties,
        }).createInput(),
      },
      options,
    );

    const mapping = this.lambda.getSimEventSourceMapping(created.UUID);

    assertDefined(
      mapping,
      `Sim Lambda event source mapping ${resource.logicalId} after ` +
        "CloudFormation creation",
    );

    return mapping;
  }
}
