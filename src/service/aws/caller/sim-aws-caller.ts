import type { SimAwsCredentials } from "../../iam/credential/sim-aws-credentials.js";

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
 * Simulated credentials supplied at an AWS operation boundary.
 *
 * Credentials are authentication material rather than a resolved principal.
 * They must be authenticated before authorization.
 */
export interface SimCredentialCaller {
  readonly kind: "credentials";
  readonly credentials: SimAwsCredentials;
}

/**
 * Resolved simulated AWS identity.
 */
export type SimAwsPrincipal =
  SimArnPrincipal | SimServicePrincipal | SimAnonymousPrincipal;

/**
 * A caller already authenticated somewhere else, carrying both the principal
 * the request is attributed to and the identity whose policies apply to it.
 *
 * A bare principal cannot express that split. It matters for an assumed-role
 * session, where the request is made by the session while the permissions come
 * from the Role behind it, and where the credentials that would otherwise carry
 * both are not available to pass on: an HTTP request proves its identity by
 * signature rather than by presenting a secret.
 */
export interface SimResolvedCaller {
  readonly kind: "resolved";
  readonly principal: SimAwsPrincipal;
  readonly identityPolicyPrincipal: SimAwsPrincipal;
}

/**
 * Caller accepted by simulated AWS service operations.
 */
export type SimAwsCaller =
  SimAwsPrincipal | SimCredentialCaller | SimResolvedCaller;
