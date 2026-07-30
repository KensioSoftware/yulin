import type { SimLambdaEventSourceMapping } from "../../../../lambda/event-source/sim-lambda-event-source-mapping.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimLambdaEventSourceMappingCfnProperties {
  readonly mapping: SimLambdaEventSourceMapping;
}

/**
 * CloudFormation-facing behaviour for an AWS::Lambda::EventSourceMapping
 * Resource.
 */
export class SimLambdaEventSourceMappingCfn implements SimCfnResourceValueAdapter {
  private readonly mapping: SimLambdaEventSourceMapping;

  constructor(properties: SimLambdaEventSourceMappingCfnProperties) {
    this.mapping = properties.mapping;
  }

  /**
   * CloudFormation Ref for AWS::Lambda::EventSourceMapping returns the
   * mapping's identifier, which is its UUID.
   */
  refValue(): SimCfnTemplateValue {
    return this.mapping.uuid;
  }

  /**
   * CloudFormation attributes for AWS::Lambda::EventSourceMapping.
   *
   * `Id` is the mapping identifier, and `EventSourceMappingArn` names the
   * mapping the way a policy would.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "Id") {
      return this.mapping.uuid;
    }

    if (attributeName === "EventSourceMappingArn") {
      return this.mapping.arn;
    }

    throw new Error(
      `Unsupported AWS::Lambda::EventSourceMapping attribute ${attributeName}`,
    );
  }
}
