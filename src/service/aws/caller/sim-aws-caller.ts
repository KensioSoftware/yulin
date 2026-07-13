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
 * Caller accepted by simulated AWS service operations.
 */
export type SimAwsCaller = SimAwsPrincipal | SimCredentialCaller;
