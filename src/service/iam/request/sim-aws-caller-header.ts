import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";
import { SimAwsInvalidCallerHeader } from "./error/sim-aws-request-auth.error.js";

/**
 * The header naming the principal a request into simulated AWS is made by.
 *
 * The same name is used on the way back out, as the simulator's own statement
 * of who it decided the caller was.
 *
 * This is the convenience path for local development and for tooling that will
 * not sign requests: a curl one-liner can be a Role without holding any
 * credentials. It is deliberately always enabled and not configurable, because
 * a simulator whose auth boundary can be half-configured is a simulator whose
 * tests do not mean what they look like.
 */
export const simAwsCallerHeaderName = "x-sim-aws-caller";

const anonymousValue = "anonymous";
const servicePrefix = "service:";
const arnPrefix = "arn:";

/**
 * Read a caller header value as the principal it names.
 *
 * No existence check is made on an ARN, matching how `runAs` already behaves:
 * naming a principal is not the same as proving it exists, and IAM
 * authorization will simply find no policies for a principal nothing created.
 */
export function simAwsCallerHeaderPrincipal(value: string): SimAwsPrincipal {
  const trimmed = value.trim();

  if (trimmed === anonymousValue) {
    return { kind: "anonymous" };
  }

  if (trimmed.startsWith(servicePrefix)) {
    return servicePrincipal(trimmed.slice(servicePrefix.length));
  }

  if (trimmed.startsWith(arnPrefix)) {
    return { kind: "arn", arn: trimmed };
  }

  throw new SimAwsInvalidCallerHeader(
    `${simAwsCallerHeaderName} value ${value} must be an ARN, ` +
      `${anonymousValue}, or ${servicePrefix}<name>`,
  );
}

/**
 * Write a principal in the form this header accepts, so what the simulator
 * reports back can be sent straight back in.
 */
export function simAwsCallerHeaderValue(principal: SimAwsPrincipal): string {
  switch (principal.kind) {
    case "arn": {
      return principal.arn;
    }
    case "service": {
      return `${servicePrefix}${principal.service}`;
    }
    case "anonymous": {
      return anonymousValue;
    }
  }
}

function servicePrincipal(service: string): SimAwsPrincipal {
  if (service.length === 0) {
    throw new SimAwsInvalidCallerHeader(
      `${simAwsCallerHeaderName} value ${servicePrefix} names no service`,
    );
  }

  return { kind: "service", service };
}
