import type { SimElbV2FixedResponseActionConfig } from "../command/sim-elbv2-shared.command.js";
import { SimElbV2ValidationError } from "../error/sim-elbv2.error.js";

/**
 * The status codes real ELB takes on a fixed-response action.
 *
 * A 3XX is missing on purpose rather than by oversight: redirecting is the
 * redirect action's job, and real ELB refuses one here.
 */
const statusCodes = /^[245]\d\d$/u;

/**
 * The content types real ELB will send a fixed response as.
 *
 * The list is short because the action is for a short answer the load balancer
 * writes itself, such as a health endpoint or a maintenance page, rather than
 * for serving content.
 */
const contentTypes = new Set([
  "text/plain",
  "text/css",
  "text/html",
  "application/javascript",
  "application/json",
]);

/**
 * Check a fixed-response configuration, refusing one ELB would not take.
 */
export function requireSimElbV2FixedResponseConfig(
  config: SimElbV2FixedResponseActionConfig | undefined,
  field: string,
): void {
  const statusCode = config?.StatusCode;

  if (statusCode === undefined || !statusCodes.test(statusCode)) {
    throw new SimElbV2ValidationError(
      `${field} fixed-response action requires a FixedResponseConfig ` +
        `StatusCode of 2XX, 4XX or 5XX. A 3XX code is a redirect action.`,
    );
  }

  const contentType = config?.ContentType;

  if (contentType !== undefined && !contentTypes.has(contentType)) {
    throw new SimElbV2ValidationError(
      `${field} fixed-response action ContentType '${contentType}' is not ` +
        `one ELB sends. The content types are ${[...contentTypes].join(", ")}.`,
    );
  }
}
