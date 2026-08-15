import type { SimEcsPortMapping } from "./sim-ecs-container-parts.js";

/**
 * The ports a container's `portMappings` declared it listens on.
 *
 * This is the one part of a container definition beyond its name and image that
 * anything here reads the meaning of, and it is read for one question: which of
 * a task's containers a load balancer's declared container port means, where
 * more than one of them is bound to a handler.
 *
 * A mapping declaring a `containerPortRange` rather than a `containerPort` is
 * left out. A range says the container listens on many ports, and choosing one
 * of them to compare against would be inventing what the declaration meant.
 */
export function simEcsContainerPorts(
  mappings: readonly SimEcsPortMapping[] | undefined,
): readonly number[] {
  return (mappings ?? [])
    .map((mapping) => mapping.containerPort)
    .filter((port) => port !== undefined);
}
