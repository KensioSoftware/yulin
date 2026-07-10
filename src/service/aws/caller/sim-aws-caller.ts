import type { SimAwsAccountId } from "../sim-aws-account.js";

export type SimAwsPrincipalType =
  "root" | "user" | "role" | "assumed-role" | "service";

/**
 * Simulated AWS principal making a request.
 *
 * This is the resolved AWS identity, not SDK command input. Real AWS derives
 * this from credentials/signing; Yulin can resolve it from test options, local
 * HTTP headers, future simulated credentials, or service-to-service context.
 */
export interface SimAwsPrincipal {
  readonly arn: string;
  readonly accountId?: SimAwsAccountId | undefined;
  readonly principalType?: SimAwsPrincipalType | undefined;
  readonly name?: string | undefined;
}

/**
 * A request made by an authenticated simulated AWS principal.
 */
export interface SimAwsPrincipalCallerContext {
  readonly kind?: "principal" | undefined;
  readonly principal: SimAwsPrincipal | string;
}

/**
 * A request made without an authenticated AWS principal.
 */
export interface SimAwsAnonymousCallerContext {
  readonly kind: "anonymous";
}

/**
 * Caller context for a simulated AWS service operation.
 *
 * Omitting the caller allows the service to apply its default caller. Supplying
 * an anonymous caller explicitly suppresses that fallback.
 */
export type SimAwsCallerContext =
  SimAwsPrincipalCallerContext | SimAwsAnonymousCallerContext;

/**
 * Reusable caller context for an explicitly anonymous request.
 */
export const SIM_AWS_ANONYMOUS_CALLER = {
  kind: "anonymous",
} as const satisfies SimAwsAnonymousCallerContext;
