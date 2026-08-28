import { assertDefined } from "../../../util/type-guard/defined.js";
import type {
  SimAwsCaller,
  SimAwsPrincipal,
  SimCredentialCaller,
} from "./sim-aws-caller.js";
import type { SimIamCredentialIdentity } from "../../iam/credential/sim-aws-credentials.js";

export interface SimAwsCredentialIdentityResolver {
  resolveCredentials(
    credentials: SimCredentialCaller["credentials"],
    now?: Date,
  ): SimIamCredentialIdentity;
}

/**
 * Caller information normalized for simulated AWS service operations.
 *
 * The effective principal is used for request context and diagnostics. The
 * identity-policy principal identifies the IAM entity whose policies apply.
 */
export interface SimAwsResolvedCaller {
  readonly principal: SimAwsPrincipal;
  readonly identityPolicyPrincipal: SimAwsPrincipal;
  readonly arn?: string | undefined;
  readonly identityPolicyArn?: string | undefined;
  readonly accountId?: string | undefined;
  readonly service?: string | undefined;
}

/**
 * What resolving a caller needs beyond the caller itself.
 */
export interface SimAwsCallerResolverProperties {
  /**
   * Authenticates a caller that presents credentials.
   */
  readonly credentialIdentityResolver?:
    | SimAwsCredentialIdentityResolver
    | undefined;

  /**
   * The caller a request naming none of its own is attributed to.
   *
   * A simulation sets this to say who its unattributed calls come from. It is
   * consulted ahead of the operation default. A simulation that names no
   * default caller keeps the Account root fallback.
   */
  readonly defaultCaller?: SimAwsCaller | undefined;
}

/**
 * Resolves caller input at a simulated AWS operation boundary.
 *
 * An omitted caller resolves to the simulation's default caller, and to the
 * supplied operation default where there is none. Explicit anonymity is
 * preserved. Credential callers are authenticated before a resolved caller is
 * returned, and a caller already resolved elsewhere is taken as it stands.
 */
export class SimAwsCallerResolver {
  private readonly credentialIdentityResolver?:
    | SimAwsCredentialIdentityResolver
    | undefined;

  private readonly defaultCaller?: SimAwsCaller | undefined;

  constructor(properties: SimAwsCallerResolverProperties = {}) {
    this.credentialIdentityResolver = properties.credentialIdentityResolver;
    this.defaultCaller = properties.defaultCaller;
  }

  /**
   * Resolve and normalize a simulated AWS caller.
   *
   * The request's own caller is used where it has one. A request without one
   * falls back to the simulation's default caller, and then to the operation
   * default the call site supplies.
   */
  resolve(
    caller: SimAwsCaller | undefined,
    defaultPrincipal: SimAwsPrincipal,
  ): SimAwsResolvedCaller {
    const stated = caller ?? this.defaultCaller;

    if (stated?.kind === "resolved") {
      return this.normalized(stated.principal, stated.identityPolicyPrincipal);
    }

    if (stated?.kind === "credentials") {
      assertDefined(
        this.credentialIdentityResolver,
        "Simulated credential callers require an IAM credential resolver",
      );

      const identity = this.credentialIdentityResolver.resolveCredentials(
        stated.credentials,
      );

      return this.normalized(
        identity.principal,
        identity.identityPolicyPrincipal,
      );
    }

    const principal = stated ?? defaultPrincipal;
    return this.normalized(principal, principal);
  }

  private normalized(
    principal: SimAwsPrincipal,
    identityPolicyPrincipal: SimAwsPrincipal,
  ): SimAwsResolvedCaller {
    if (principal.kind === "arn") {
      const identityPolicyArn =
        identityPolicyPrincipal.kind === "arn"
          ? identityPolicyPrincipal.arn
          : undefined;

      return {
        principal,
        identityPolicyPrincipal,
        arn: principal.arn,
        identityPolicyArn,
        accountId: this.accountId(principal.arn),
      };
    }

    if (principal.kind === "service") {
      return {
        principal,
        identityPolicyPrincipal,
        service: principal.service,
      };
    }

    return {
      principal,
      identityPolicyPrincipal,
    };
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
