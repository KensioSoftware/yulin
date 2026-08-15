import type { SimEcsService } from "../../../../ecs/service/sim-ecs-service.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimEcsServiceCfnProperties {
  readonly service: SimEcsService;
}

/**
 * CloudFormation-facing values for a simulated ECS service.
 */
export class SimEcsServiceCfn implements SimCfnResourceValueAdapter {
  private readonly service: SimEcsService;

  constructor(properties: SimEcsServiceCfnProperties) {
    this.service = properties.service;
  }

  /**
   * AWS::ECS::Service Ref returns the service ARN.
   *
   * The ARN carries the cluster the service belongs to, which is what makes it
   * enough on its own: a service name means a different service in each
   * cluster that holds one.
   */
  refValue(): SimCfnTemplateValue {
    return this.service.serviceArn;
  }

  /**
   * AWS::ECS::Service attributes.
   *
   * `Name` is the service name within its cluster, and `ServiceArn` answers
   * with the same ARN Ref does.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "Name") {
      return this.service.serviceName;
    }

    if (attributeName === "ServiceArn") {
      return this.service.serviceArn;
    }

    throw new Error(`Unsupported AWS::ECS::Service attribute ${attributeName}`);
  }
}
