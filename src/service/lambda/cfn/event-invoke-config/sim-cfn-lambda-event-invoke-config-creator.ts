import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLambdaEventInvokeConfig } from "../../function/event-invoke/sim-lambda-event-invoke-config.js";
import type { SimLambda } from "../../sim-lambda.js";
import { SimCfnLambdaEventInvokeConfigProperties } from "./sim-cfn-lambda-event-invoke-config-properties.js";

interface SimCfnLambdaEventInvokeConfigCreatorProperties {
  readonly lambda: SimLambda;
}

/**
 * Creates simulated event invoke configs from CloudFormation Resources.
 *
 * This is what CDK emits for `onFailure`, `onSuccess`, `retryAttempts` and
 * `maxEventAge` on a function, so a synthesized template is the usual way a
 * config comes into existence outside a direct SDK call. It is written through
 * the ordinary PutFunctionEventInvokeConfig command, so a template deploying
 * one gets the same validation and the same authorization an SDK caller would.
 */
export class SimCfnLambdaEventInvokeConfigCreator {
  private readonly lambda: SimLambda;

  constructor(properties: SimCfnLambdaEventInvokeConfigCreatorProperties) {
    this.lambda = properties.lambda;
  }

  /**
   * Create a config from an AWS::Lambda::EventInvokeConfig Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimLambdaEventInvokeConfig> {
    const { functionName, qualifier, input } =
      new SimCfnLambdaEventInvokeConfigProperties({
        resource,
        properties,
      }).createInput();

    await this.lambda.putFunctionEventInvokeConfig({ input });

    const config = this.lambda.getSimEventInvokeConfig(functionName, qualifier);

    assertDefined(
      config,
      `Sim Lambda event invoke config ${resource.logicalId} after ` +
        "CloudFormation creation",
    );

    return config;
  }
}
