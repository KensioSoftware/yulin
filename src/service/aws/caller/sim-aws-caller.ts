import type { SimAwsAccountId } from "../sim-aws-account.js";

export type SimAwsPrincipalType =
  "anonymous" | "root" | "user" | "role" | "assumed-role" | "service";

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
 * Optional caller context for simulated AWS service operations.
 *
 * This is the authoritative place for request identity. The principal field
 * identifies who is making the request when that has been resolved. Additional
 * request attributes can be added here later for IAM condition keys without
 * changing individual service command shapes.
 */
export interface SimAwsCallerContext {
  readonly principal?: SimAwsPrincipal | string | undefined;
}
