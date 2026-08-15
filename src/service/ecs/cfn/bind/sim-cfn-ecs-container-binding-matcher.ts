import { SimCfnImageRepositoryTarget } from "../../../cloudformation/bind/validate/sim-cfn-image-repository-target.js";
import { SimCfnResourceCdkPath } from "../../../cloudformation/bind/validate/sim-cfn-resource-cdk-path.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import { SimCfnEcsDeclaredTaskDefinition } from "../task-definition/sim-cfn-ecs-declared-task-definition.js";
import type { SimCfnEcsContainerBinding } from "./sim-cfn-ecs-container-binding.type.js";

/**
 * Matches container bindings against the task definitions a Stack declares.
 *
 * A binding is checked as the Stack is built, before anything is created, so
 * everything it is matched on is read from the template rather than from
 * simulated ECS. That is the point: a binding naming a container the Stack
 * does not declare is a mistake in the test, and saying so at the deployment
 * is where the mistake is.
 */
export class SimCfnEcsContainerBindingMatcher {
  private readonly taskDefinitions: readonly SimCfnEcsDeclaredTaskDefinition[];

  constructor(resources: ReadonlyMap<string, SimCfnResource>) {
    this.taskDefinitions = SimCfnEcsDeclaredTaskDefinition.of(resources);
  }

  /**
   * How a binding that resolved to nothing is named in the refusal.
   */
  static describe(binding: SimCfnEcsContainerBinding): string {
    if (binding.logicalId !== undefined) {
      return `container binding for logicalId ${JSON.stringify(binding.logicalId)}`;
    }

    if (binding.imageRepository !== undefined) {
      return `container binding for imageRepository ${JSON.stringify(binding.imageRepository)}`;
    }

    return (
      `container binding for family ${JSON.stringify(binding.family)} ` +
      `container ${JSON.stringify(binding.containerName)}`
    );
  }

  /**
   * Whether this binding targets a container the Stack declares.
   */
  matches(binding: SimCfnEcsContainerBinding): boolean {
    return this.taskDefinitions.some((taskDefinition) =>
      simCfnEcsBindingTargets(binding, taskDefinition),
    );
  }
}

/**
 * Whether one binding targets one declared task definition.
 *
 * The three target forms are checked in the order they are declared in, since
 * a binding carries exactly one of them.
 */
export function simCfnEcsBindingTargets(
  binding: SimCfnEcsContainerBinding,
  taskDefinition: SimCfnEcsDeclaredTaskDefinition,
): boolean {
  if (binding.logicalId !== undefined) {
    return simCfnEcsResourceIsNamed(
      taskDefinition.declaredBy,
      binding.logicalId,
    );
  }

  if (binding.imageRepository !== undefined) {
    const target = new SimCfnImageRepositoryTarget(binding.imageRepository);

    return taskDefinition
      .containers()
      .some((container) => target.matchesImageUri(container.image));
  }

  return (
    taskDefinition.family() === binding.family &&
    taskDefinition
      .containers()
      .some((container) => container.name === binding.containerName)
  );
}

/**
 * Whether a Resource answers to this logical ID.
 *
 * CDK generates a logical ID from a construct path and a hash, which is not
 * something a test wants to write out, so the construct ID from the Resource's
 * CDK metadata answers to it too. This is the same rule an executable Resource
 * binding is matched by.
 */
export function simCfnEcsResourceIsNamed(
  resource: SimCfnResource,
  logicalId: string,
): boolean {
  return (
    resource.logicalId === logicalId ||
    new SimCfnResourceCdkPath(resource).constructId() === logicalId
  );
}
