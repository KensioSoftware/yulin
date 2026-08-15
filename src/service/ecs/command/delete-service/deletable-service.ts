import { SimEcsInvalidParameterException } from "../../error/sim-ecs.error.js";
import type { SimEcsService } from "../../service/sim-ecs-service.js";

/**
 * Take a service to delete, refusing one still keeping tasks running.
 *
 * Real ECS refuses this unless the request forces it, and the refusal is worth
 * having: scaling a service to zero before deleting it is the ordinary way
 * round, and a test that skips it is a test whose deployment would fail.
 */
export function requiredDeletableService(
  service: SimEcsService,
  force: boolean | undefined,
): SimEcsService {
  if (force === true || service.desiredCount === 0) {
    return service;
  }

  throw new SimEcsInvalidParameterException(
    `The service ${service.serviceName} cannot be deleted while it is scaled ` +
      `above zero. Scale it to zero first, or delete it with force.`,
  );
}
