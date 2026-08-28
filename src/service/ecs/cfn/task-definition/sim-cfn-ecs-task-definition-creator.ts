import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnBinding } from "../../../cloudformation/bind/sim-cfn-binding.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRegisterTaskDefinitionCommandInput } from "../../command/register-task-definition/register-task-definition.command.js";
import type { SimEcsTaskDefinition } from "../../task-definition/sim-ecs-task-definition.js";
import type { SimEcs } from "../../sim-ecs.js";
import { SimCfnEcsContainerBindings } from "../bind/sim-cfn-ecs-container-bindings.js";
import { SimCfnEcsTaskDefinitionProperties } from "./sim-cfn-ecs-task-definition-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

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
   * The bindings the deployment supplied are applied before the registration
   * is made, from what the registration is going to say. A binding naming a
   * container the declaration does not hold is refused, and refusing it first
   * is what leaves nothing behind: a revision is immutable once registered, so
   * one registered and then found to be unbindable could only be deregistered,
   * and simulated CloudFormation rolls nothing back.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    bindings?: readonly SimCfnBinding[],
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimEcsTaskDefinition> {
    const taskDefinitionProperties = new SimCfnEcsTaskDefinitionProperties({
      resource,
      properties,
    });
    const input = taskDefinitionProperties.registerTaskDefinitionInput();

    taskDefinitionProperties.recordIgnoredProperties();

    new SimCfnEcsContainerBindings({ resource, bindings }).applyTo(this.ecs, {
      family: taskDefinitionProperties.family(),
      containerNames: simCfnEcsDeclaredContainerNames(input),
    });

    const registered = await this.ecs.registerTaskDefinition(
      { input },
      options,
    );
    const taskDefinitionArn = registered.taskDefinition?.taskDefinitionArn;

    assertDefined(
      taskDefinitionArn,
      `sim ECS task definition ARN for CloudFormation Resource ${resource.logicalId}`,
    );

    return this.ecs.taskDefinition(taskDefinitionArn);
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
  async delete(
    taskDefinition: SimEcsTaskDefinition,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await this.ecs.deregisterTaskDefinition(
      { input: { taskDefinition: taskDefinition.taskDefinitionArn } },
      options,
    );
  }
}

/**
 * The container names the registration about to be made declares.
 *
 * A container declaring no name at all is left out, since
 * `RegisterTaskDefinition` is about to refuse it, and naming it in a binding
 * refusal would send a reader after the wrong thing.
 */
function simCfnEcsDeclaredContainerNames(
  input: SimRegisterTaskDefinitionCommandInput,
): readonly string[] {
  return (input.containerDefinitions ?? [])
    .map((container) => container.name)
    .filter((name) => name !== undefined);
}
