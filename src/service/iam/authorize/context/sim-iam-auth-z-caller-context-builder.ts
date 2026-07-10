import type {
  SimAwsCallerContext,
  SimAwsPrincipal,
} from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamAuthZPolicySource } from "./sim-iam-auth-z-context.js";

interface SimIamAuthZCallerContext {
  readonly callerPrincipal: SimAwsPrincipal | undefined;
  readonly rootPolicySources: readonly SimIamAuthZPolicySource[];
}

/**
 * Resolves the caller principal and any policy sources implied by that caller.
 *
 * Authorization requests may omit a caller, provide an anonymous caller,
 * provide a principal ARN, or provide a complete principal object. This builder
 * applies those cases consistently before identity and resource policies are
 * collected.
 *
 * The configured default principal represents the simulated account root. It is
 * used only when the request omits a caller. An explicit anonymous caller does
 * not fall back to root, allowing services to evaluate unauthenticated
 * requests.
 *
 * Root access is modelled as an inline identity policy because the authorizer
 * evaluates all permissions through policy sources. Keeping that policy here
 * ties it to the rule that identifies the default root principal rather than to
 * general authorization-context assembly.
 */
export class SimIamAuthZCallerContextBuilder {
  private readonly defaultCallerPrincipal?: SimAwsPrincipal | undefined;

  constructor(defaultCallerPrincipal?: SimAwsPrincipal) {
    this.defaultCallerPrincipal = defaultCallerPrincipal;
  }

  /**
   * Resolve request caller data and add the simulated root policy when
   * applicable.
   */
  build(caller: SimAwsCallerContext | undefined): SimIamAuthZCallerContext {
    const callerPrincipal = this.callerPrincipal(caller);

    return {
      callerPrincipal,
      rootPolicySources: this.rootPolicySources(callerPrincipal),
    };
  }

  /**
   * Convert the caller representation used by simulated AWS services into the
   * principal representation consumed by IAM authorization.
   */
  private callerPrincipal(
    caller: SimAwsCallerContext | undefined,
  ): SimAwsPrincipal | undefined {
    if (caller?.kind === "anonymous") {
      return undefined;
    }

    if (typeof caller?.principal === "string") {
      return {
        arn: caller.principal,
      };
    }

    return caller?.principal ?? this.defaultCallerPrincipal;
  }

  /**
   * Give the configured account-root principal unrestricted identity access.
   *
   * Comparing ARNs rather than object identity ensures that an explicitly
   * supplied principal object for the same root ARN receives the same simulated
   * root permissions as an omitted caller.
   */
  private rootPolicySources(
    callerPrincipal: SimAwsPrincipal | undefined,
  ): readonly SimIamAuthZPolicySource[] {
    if (
      this.defaultCallerPrincipal === undefined ||
      callerPrincipal?.arn !== this.defaultCallerPrincipal.arn
    ) {
      return [];
    }

    return [
      {
        sourceType: "identity-inline",
        policyName: "SimAwsAccountRootAccess",
        document: {
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "*",
            Resource: "*",
          },
        },
      },
    ];
  }
}
