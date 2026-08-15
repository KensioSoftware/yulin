import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnDeployBinding } from "../../../cloudformation/bind/sim-cfn-deploy-binding.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimEcsTaskDefinition } from "../../task-definition/sim-ecs-task-definition.js";
import type { SimEcs } from "../../sim-ecs.js";
import { SimCfnEcsContainerBindings } from "../bind/sim-cfn-ecs-container-bindings.js";
import { SimCfnEcsTaskDefinitionProperties } from "./sim-cfn-ecs-task-definition-properties.js";

interface SimCfnEcsTaskDefinitionCreatorProperties {
  readonly ecs: SimEcs;
}

/**
 * Registers simulated task definitions from AWS::ECS::TaskDefinition
 * Resources.
 *
 * The revision is registered through the ordinary RegisterTaskDefinition
 * command rather than constructed directly, so a revision a template deployed
 * is the same thing an SDK caller would have got: the same container
 * validation, the same revision numbering, and the same refusals.
 *
 * Each deployment of the template registers a new revision, as real
 * CloudFormation does, because a task definition revision is immutable and an
 * updated one is a new revision of the same family.
 */
export class SimCfnEcsTaskDefinitionCreator {
  private readonly ecs: SimEcs;

  constructor(properties: SimCfnEcsTaskDefinitionCreatorProperties) {
    this.ecs = properties.ecs;
  }

  /**
   * Register a revision from an AWS::ECS::TaskDefinition Resource.
   *
   * The bindings the deployment supplied are applied after the revision is
   * registered, because a binding naming the Resource is bound by family and
   * the family is only settled once the registration has been made.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    bindings?: readonly SimCfnDeployBinding[],
  ): Promise<SimEcsTaskDefinition> {
    const taskDefinitionProperties = new SimCfnEcsTaskDefinitionProperties({
      resource,
      properties,
    });
    const input = taskDefinitionProperties.registerTaskDefinitionInput();

    taskDefinitionProperties.recordIgnoredProperties();

    const registered = await this.ecs.registerTaskDefinition({ input });
    const taskDefinitionArn = registered.taskDefinition?.taskDefinitionArn;

    assertDefined(
      taskDefinitionArn,
      `sim ECS task definition ARN for CloudFormation Resource ${resource.logicalId}`,
    );

    const taskDefinition = this.ecs.taskDefinition(taskDefinitionArn);

    new SimCfnEcsContainerBindings({ resource, bindings }).applyTo(
      this.ecs,
      taskDefinition,
    );

    return taskDefinition;
  }

  /**
   * Deregister a revision registered from an AWS::ECS::TaskDefinition
   * Resource.
   *
   * Deregistering marks the revision `INACTIVE` rather than removing it, as
   * `DeregisterTaskDefinition` does, and the revision number it used is not
   * freed. Only the revision this Resource registered is deregistered, which
   * is also what an update does with the revision it replaces, since sim
   * CloudFormation replaces a changed Resource rather than updating it.
   */
  async delete(taskDefinition: SimEcsTaskDefinition): Promise<void> {
    await this.ecs.deregisterTaskDefinition({
      input: { taskDefinition: taskDefinition.taskDefinitionArn },
    });
  }
}
