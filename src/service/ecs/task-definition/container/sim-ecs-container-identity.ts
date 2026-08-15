import { SimEcsClientException } from "../../error/sim-ecs.error.js";

/**
 * The name a container definition is referred to by everywhere else.
 *
 * Required here as it is on real ECS: a task's containers are recorded by name,
 * an override names one, and a binding matches one, so a definition without a
 * name could not take part in any of it.
 */
export function requiredSimEcsContainerName(name: string | undefined): string {
  if (name === undefined || name === "") {
    throw new SimEcsClientException(
      "Container.name should not be null or empty.",
    );
  }

  return name;
}

/**
 * The image URI a container definition declared.
 *
 * Required here as it is on real ECS. Nothing pulls it or reads it, but it is
 * the identifier a simulated task run matches an executable binding against, so
 * a definition without one could never run.
 */
export function requiredSimEcsContainerImage(
  image: string | undefined,
  name: string,
): string {
  if (image === undefined || image === "") {
    throw new SimEcsClientException(
      `Container.image should not be null or empty for container ${name}.`,
    );
  }

  return image;
}
