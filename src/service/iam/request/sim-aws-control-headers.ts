import { simAwsCallerHeaderName } from "./sim-aws-caller-header.js";
import {
  simAwsSourceAccountHeaderName,
  simAwsSourceArnHeaderName,
} from "./sim-aws-request-source.js";

/**
 * Header names that are instructions to the simulator rather than part of the
 * request being simulated.
 *
 * They state who a request is from and what it is for, so anything passing a
 * request on to a simulated service has to decide what to do with them rather
 * than forward them by accident: the HTTP boundary strips them once the
 * request has been attributed, and sim CloudFront strips a viewer's before
 * deciding for itself what an Origin request says.
 */
export const simAwsControlHeaderNames: readonly string[] = [
  simAwsCallerHeaderName,
  simAwsSourceArnHeaderName,
  simAwsSourceAccountHeaderName,
];

/**
 * Remove the simulator's control headers from a set of request headers.
 */
export function stripSimAwsControlHeaders(headers: Headers): void {
  for (const name of simAwsControlHeaderNames) {
    headers.delete(name);
  }
}
