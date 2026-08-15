import {
  type SimCfnDeployBinding,
  simCfnIsContainerBinding,
} from "../../../cloudformation/bind/sim-cfn-deploy-binding.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimEcsTaskDefinition } from "../../task-definition/sim-ecs-task-definition.js";
import type { SimEcs } from "../../sim-ecs.js";
import { simCfnEcsPropertyError } from "../property/sim-cfn-ecs-property-error.js";
import { SimCfnEcsDeclaredTaskDefinition } from "../task-definition/sim-cfn-ecs-declared-task-definition.js";
import { simCfnEcsBindingTargets } from "./sim-cfn-ecs-container-binding-matcher.js";
import type { SimCfnEcsContainerBinding } from "./sim-cfn-ecs-container-binding.type.js";

interface SimCfnEcsContainerBindingsProperties {
  readonly resource: SimCfnResource;
  readonly bindings?: readonly SimCfnDeployBinding[] | undefined;
}

/**
 * The bindings a deployment supplied for one task definition Resource.
 *
 * A binding naming a family or an image repository already says everything
 * simulated ECS needs, so it is handed over as it was written. A binding
 * naming the task definition Resource is the one this has work to do for: the
 * logical ID means nothing to ECS, which knows families, so it is turned into
 * the family the Resource registered under.
 *
 * A binding is applied only to the task definition it targets, so a Stack
 * declaring several of them does not bind a handler to all of them.
 */
export class SimCfnEcsContainerBindings {
  private readonly declared: SimCfnEcsDeclaredTaskDefinition;
  private readonly bindings: readonly SimCfnEcsContainerBinding[];

  constructor(properties: SimCfnEcsContainerBindingsProperties) {
    this.declared = new SimCfnEcsDeclaredTaskDefinition(properties.resource);
    this.bindings = (properties.bindings ?? []).filter((binding) =>
      simCfnIsContainerBinding(binding),
    );
  }

  /**
   * Bind what this deployment supplied for the revision just registered.
   */
  applyTo(ecs: SimEcs, taskDefinition: SimEcsTaskDefinition): void {
    for (const binding of this.bindings) {
      if (!simCfnEcsBindingTargets(binding, this.declared)) {
        continue;
      }

      this.bind(ecs, binding, taskDefinition);
    }
  }

  private bind(
    ecs: SimEcs,
    binding: SimCfnEcsContainerBinding,
    taskDefinition: SimEcsTaskDefinition,
  ): void {
    if (binding.logicalId === undefined) {
      ecs.bindContainer(binding);

      return;
    }

    this.bindNamedContainer(ecs, binding, taskDefinition);
  }

  /**
   * Bind a Resource-targeted binding to the container it means.
   */
  private bindNamedContainer(
    ecs: SimEcs,
    binding: SimCfnEcsContainerBinding,
    taskDefinition: SimEcsTaskDefinition,
  ): void {
    const target = {
      family: taskDefinition.family,
      containerName: this.containerName(binding, taskDefinition),
    };

    if (binding.run !== undefined) {
      ecs.bindContainer({ ...target, run: binding.run });

      return;
    }

    ecs.bindContainer({ ...target, http: binding.http });
  }

  /**
   * Which container of the revision a Resource-targeted binding means.
   *
   * A binding that names one has to name one the revision declares, and a
   * binding that names none means the only container there is. A revision
   * declaring several containers has nothing to choose between them by, and
   * the usual cause is a log router or an agent alongside the application, so
   * the refusal lists what the revision declares.
   */
  private containerName(
    binding: SimCfnEcsContainerBinding,
    taskDefinition: SimEcsTaskDefinition,
  ): string {
    if (binding.containerName === undefined) {
      return this.soleContainerName(taskDefinition);
    }

    if (!taskDefinition.containers.has(binding.containerName)) {
      throw this.refuse(
        `a binding names container ${binding.containerName}, which family ${taskDefinition.family} does not declare: ${simCfnEcsContainerNames(taskDefinition)}`,
      );
    }

    return binding.containerName;
  }

  /**
   * The one container a binding naming no container can only have meant.
   */
  private soleContainerName(taskDefinition: SimEcsTaskDefinition): string {
    const containers = taskDefinition.containers.all();
    const sole = containers.at(0);

    if (sole !== undefined && containers.length === 1) {
      return sole.name;
    }

    throw this.refuse(
      `a binding naming this task definition needs a containerName, because ` +
        `family ${taskDefinition.family} declares ${String(containers.length)} containers: ${simCfnEcsContainerNames(taskDefinition)}`,
    );
  }

  private refuse(reason: string): Error {
    return simCfnEcsPropertyError(this.declared.declaredBy.logicalId, reason);
  }
}

/**
 * The containers a revision declares, for a refusal to name.
 */
function simCfnEcsContainerNames(taskDefinition: SimEcsTaskDefinition): string {
  return taskDefinition.containers
    .all()
    .map((container) => container.name)
    .join(", ");
}
