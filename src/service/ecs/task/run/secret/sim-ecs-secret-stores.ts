import type { SimAwsPrincipal } from "../../../../aws/caller/sim-aws-caller.js";
import type { SimEcsSecretReference } from "./sim-ecs-secret-reference.js";
import { SimEcsSecretResolutionError } from "./sim-ecs-secret.error.js";

/**
 * One read of a container secret's value.
 *
 * The caller is the task execution Role rather than the task Role. That is the
 * whole distinction: the execution Role is what the task agent pulls secrets
 * with, before any container starts, and the task Role is what the container's
 * own AWS calls are attributed to once it does.
 */
export interface SimEcsSecretRead {
  readonly reference: SimEcsSecretReference;
  readonly caller: SimAwsPrincipal;
}

/**
 * Where a simulated ECS task's container secrets are read from.
 *
 * Reading goes through the store service's ordinary command path rather than
 * its state, so simulated IAM decides it exactly as it decides a call an
 * application makes. A denial is what makes a task fail to start.
 */
export interface SimEcsSecretStores {
  read(request: SimEcsSecretRead): Promise<string>;
}

/**
 * The secret stores a simulated ECS built on its own can reach, which is none.
 *
 * Simulated ECS is usually built through a SimAws instance, which hands it that
 * simulation's Secrets Manager and Parameter Store. One built by itself has
 * neither to reach, so a container declaring a secret says so rather than
 * running without the variable it expects.
 */
export class SimEcsUnreachableSecretStores implements SimEcsSecretStores {
  // Asynchronous so that it refuses the way the other implementation does,
  // through a rejected promise rather than a throw the caller has to be
  // holding a try around at the moment it calls.
  // oxlint-disable-next-line require-await -- there is nothing here to await
  async read(request: SimEcsSecretRead): Promise<string> {
    throw new SimEcsSecretResolutionError(
      `${request.reference.identifier} cannot be read, because this ` +
        `simulated ECS reaches no simulated Secrets Manager or SSM Parameter ` +
        `Store. Build it through a SimAws instance to resolve container ` +
        `secrets.`,
    );
  }
}
