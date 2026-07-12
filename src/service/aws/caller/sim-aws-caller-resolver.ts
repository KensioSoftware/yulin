import type { SimAwsPrincipal } from "./sim-aws-caller.js";

/**
 * Caller information normalized for simulated AWS service operations.
 *
 * Metadata that cannot be derived from the supplied principal is left
 * undefined.
 */
export interface SimAwsResolvedCaller {
  readonly principal: SimAwsPrincipal;
  readonly arn?: string | undefined;
  readonly accountId?: string | undefined;
  readonly service?: string | undefined;
}

/**
 * Resolves caller input at a simulated AWS operation boundary.
 *
 * An omitted caller resolves to the supplied operation default. Explicit
 * anonymity is preserved.
 */
export class SimAwsCallerResolver {
  /**
   * Resolve and normalize a simulated AWS caller.
   */
  resolve(
    caller: SimAwsPrincipal | undefined,
    defaultPrincipal: SimAwsPrincipal,
  ): SimAwsResolvedCaller {
    const principal = caller ?? defaultPrincipal;

    if (principal.kind === "arn") {
      return {
        principal,
        arn: principal.arn,
        accountId: this.accountId(principal.arn),
      };
    }

    if (principal.kind === "service") {
      return {
        principal,
        service: principal.service,
      };
    }

    return { principal };
  }

  /**
   * Extract the account component of an ARN when it contains one.
   */
  private accountId(arn: string): string | undefined {
    const accountId = arn.split(":", 6)[4];
    return accountId === undefined || accountId.length === 0
      ? undefined
      : accountId;
  }
}
