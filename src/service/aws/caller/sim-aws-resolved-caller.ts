import type { SimAwsPrincipal, SimResolvedCaller } from "./sim-aws-caller.js";
import {
  SimAwsCallerResolver,
  type SimAwsResolvedCaller,
} from "./sim-aws-caller-resolver.js";

/**
 * State an already-resolved caller as the caller of another request.
 *
 * A resolver answers with a SimAwsResolvedCaller, and a service that goes on
 * to ask IAM about the same caller has to pass one back in. Both principals
 * travel together, so an assumed-role session keeps the Role its policies come
 * from instead of arriving as a session ARN that owns none.
 */
export function simAwsCallerFor(
  caller: SimAwsResolvedCaller,
): SimResolvedCaller {
  return {
    kind: "resolved",
    principal: caller.principal,
    identityPolicyPrincipal: caller.identityPolicyPrincipal,
  };
}

/**
 * Resolve a principal that needs nothing authenticated.
 *
 * A service principal, or an ARN something else has already established, is
 * its own answer. This is the short way to the SimAwsResolvedCaller that an
 * authorization boundary asks for.
 */
export function simAwsResolvedCallerOf(
  principal: SimAwsPrincipal,
): SimAwsResolvedCaller {
  return new SimAwsCallerResolver().resolve(principal, principal);
}
