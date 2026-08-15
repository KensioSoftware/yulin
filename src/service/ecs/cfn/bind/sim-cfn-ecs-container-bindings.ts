import {
  type SimCfnDeployBinding,
  simCfnIsContainerBinding,
} from "../../../cloudformation/bind/sim-cfn-deploy-binding.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimEcs } from "../../sim-ecs.js";
import { simCfnEcsPropertyError } from "../property/sim-cfn-ecs-property-error.js";
import { SimCfnEcsDeclaredTaskDefinition } from "../task-definition/sim-cfn-ecs-declared-task-definition.js";
import { simCfnEcsBindingWork } from "./sim-cfn-ecs-binding-work.js";
import { simCfnEcsBindingTargets } from "./sim-cfn-ecs-container-binding-matcher.js";
import type { SimCfnEcsContainerBinding } from "./sim-cfn-ecs-container-binding.type.js";

interface SimCfnEcsContainerBindingsProperties {
  readonly resource: SimCfnResource;
  readonly bindings?: readonly SimCfnDeployBinding[] | undefined;
}

/**
 * What a task definition Resource is about to register, as far as a binding
 * needs to know: which family, and which containers it names.
 */
export interface SimCfnEcsRegistration {
  readonly family: string;
  readonly containerNames: readonly string[];
}

/**
 * The bindings a deployment supplied for one task definition Resource.
 *
 * A binding naming a family or an image repository already says everything
 * simulated ECS needs, so it is handed over as it was written. A binding
 * naming the task definition Resource is the one this has work to do for: the
 * logical ID means nothing to ECS, which knows families, so it is turned into
 * the family the Resource is registering under.
 *
 * A binding is applied only to the task definition it targets, so a Stack
 * declaring several of them does not bind a handler to all of them.
 *
 * The bindings are applied before the registration is made, from what the
 * registration is going to say rather than from the revision it made. A
 * binding is refused for naming a container the declaration does not hold, and
 * doing that first is what stops a refusal leaving an active revision behind
 * it: there is nothing to take back, because nothing has been registered. A
 * binding held for a family that is then never registered reaches no
 * container, which is what a binding made before its task definition already
 * is.
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
   * Bind what this deployment supplied for the registration about to be made.
   */
  applyTo(ecs: SimEcs, registration: SimCfnEcsRegistration): void {
    for (const binding of this.bindings) {
      if (!simCfnEcsBindingTargets(binding, this.declared)) {
        continue;
      }

      this.bind(ecs, binding, registration);
    }
  }

  private bind(
    ecs: SimEcs,
    binding: SimCfnEcsContainerBinding,
    registration: SimCfnEcsRegistration,
  ): void {
    if (binding.logicalId === undefined) {
      ecs.bindContainer(binding);

      return;
    }

    this.bindNamedContainer(ecs, binding, registration);
  }

  /**
   * Bind a Resource-targeted binding to the container it means.
   *
   * Only the target is rewritten. What the binding does, whichever of the
   * shapes it is, is carried over as it was written, so a handler simulated
   * ECS refuses is refused there rather than being sorted into shapes twice.
   */
  private bindNamedContainer(
    ecs: SimEcs,
    binding: SimCfnEcsContainerBinding,
    registration: SimCfnEcsRegistration,
  ): void {
    ecs.bindContainer({
      family: registration.family,
      containerName: this.containerName(binding, registration),
      ...simCfnEcsBindingWork(binding),
    });
  }

  /**
   * Which container of the registration a Resource-targeted binding means.
   *
   * A binding that names one has to name one the registration declares, and a
   * binding that names none means the only container there is. A registration
   * declaring several containers has nothing to choose between them by, and
   * the usual cause is a log router or an agent alongside the application, so
   * the refusal lists what the registration declares.
   */
  private containerName(
    binding: SimCfnEcsContainerBinding,
    registration: SimCfnEcsRegistration,
  ): string {
    if (binding.containerName === undefined) {
      return this.soleContainerName(registration);
    }

    const declaredNames = registration.containerNames;

    if (!declaredNames.includes(binding.containerName)) {
      throw this.refuse(
        `a binding names container ${binding.containerName}, which family ${registration.family} does not declare: ${declaredNames.join(", ")}`,
      );
    }

    return binding.containerName;
  }

  /**
   * The one container a binding naming no container can only have meant.
   */
  private soleContainerName(registration: SimCfnEcsRegistration): string {
    const declaredNames = registration.containerNames;
    const sole = declaredNames.at(0);

    if (sole !== undefined && declaredNames.length === 1) {
      return sole;
    }

    throw this.refuse(
      `a binding naming this task definition needs a containerName, because ` +
        `family ${registration.family} declares ${String(declaredNames.length)} containers: ${declaredNames.join(", ")}`,
    );
  }

  private refuse(reason: string): Error {
    return simCfnEcsPropertyError(this.declared.declaredBy.logicalId, reason);
  }
}
