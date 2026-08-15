import type { SimEcsTaskDefinition } from "../../../../ecs/task-definition/sim-ecs-task-definition.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimEcsTaskDefinitionCfnProperties {
  readonly taskDefinition: SimEcsTaskDefinition;
}

/**
 * CloudFormation-facing values for a simulated ECS task definition.
 */
export class SimEcsTaskDefinitionCfn implements SimCfnResourceValueAdapter {
  private readonly taskDefinition: SimEcsTaskDefinition;

  constructor(properties: SimEcsTaskDefinitionCfnProperties) {
    this.taskDefinition = properties.taskDefinition;
  }

  /**
   * AWS::ECS::TaskDefinition Ref returns the task definition ARN, revision and
   * all.
   *
   * The revision is the point of it. A service or a scheduled task naming the
   * family alone would follow the latest revision, where a Ref pins what the
   * stack deployed, which is what makes an update of the stack a change of
   * what runs.
   */
  refValue(): SimCfnTemplateValue {
    return this.taskDefinition.taskDefinitionArn;
  }

  /**
   * AWS::ECS::TaskDefinition attributes.
   *
   * `TaskDefinitionArn` is the only one, and it answers with the same ARN Ref
   * does.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName !== "TaskDefinitionArn") {
      throw new Error(
        `Unsupported AWS::ECS::TaskDefinition attribute ${attributeName}`,
      );
    }

    return this.taskDefinition.taskDefinitionArn;
  }
}
