/**
 * Resolved sim principal with an ARN, such as an IAM user or role.
 */
export interface SimArnPrincipal {
  readonly kind: "arn";
  readonly arn: string;
}

/**
 * Resolved sim principal with a service name, such as lambda.amazonaws.com.
 */
export interface SimServicePrincipal {
  readonly kind: "service";
  readonly service: string;
}

/**
 * Resolved sim principal with an anonymous identity.
 */
export interface SimAnonymousPrincipal {
  readonly kind: "anonymous";
}

/**
 * Resolved simulated AWS identity making a request.
 */
export type SimAwsPrincipal =
  SimArnPrincipal | SimServicePrincipal | SimAnonymousPrincipal;

/**
 * Return the principal ARN when the principal is ARN-based.
 */
export function simAwsPrincipalArn(
  principal: SimAwsPrincipal | undefined,
): string | undefined {
  return principal?.kind === "arn" ? principal.arn : undefined;
}

/**
 * TODO: inline this everywhere it's used?
 * Reusable principal for an explicitly anonymous request.
 */
export const SIM_AWS_ANONYMOUS_CALLER = {
  kind: "anonymous",
} as const satisfies SimAwsPrincipal;
