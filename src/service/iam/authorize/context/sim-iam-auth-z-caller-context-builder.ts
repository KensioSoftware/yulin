import {
  SimAwsCallerResolver,
  type SimAwsCredentialIdentityResolver,
  type SimAwsResolvedCaller,
} from "../../../aws/caller/sim-aws-caller-resolver.js";
import type {
  SimAwsCaller,
  SimAwsPrincipal,
} from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamAuthZPolicySource } from "./sim-iam-auth-z-context.js";

export interface SimIamAuthZCallerContext {
  readonly caller: SimAwsResolvedCaller;
  readonly rootPolicySources: readonly SimIamAuthZPolicySource[];
}

/**
 * Resolves the caller and any policy sources implied by that caller.
 *
 * The configured default principal represents the simulated account root. It is
 * used only when the request omits a caller. An explicit anonymous caller does
 * not fall back to root.
 */
export class SimIamAuthZCallerContextBuilder {
  private readonly callerResolver: SimAwsCallerResolver;
  private readonly defaultCallerPrincipal: SimAwsPrincipal;

  constructor(
    defaultCallerPrincipal: SimAwsPrincipal,
    credentialIdentityResolver: SimAwsCredentialIdentityResolver,
  ) {
    this.defaultCallerPrincipal = defaultCallerPrincipal;
    this.callerResolver = new SimAwsCallerResolver(credentialIdentityResolver);
  }

  /**
   * Resolve request caller data and add the simulated root policy when
   * applicable.
   */
  build(caller: SimAwsCaller | undefined): SimIamAuthZCallerContext {
    const resolvedCaller = this.callerResolver.resolve(
      caller,
      this.defaultCallerPrincipal,
    );

    return {
      caller: resolvedCaller,
      rootPolicySources: this.rootPolicySources(resolvedCaller),
    };
  }

  /**
   * Give the configured account-root principal unrestricted identity access.
   */
  private rootPolicySources(
    caller: SimAwsResolvedCaller,
  ): readonly SimIamAuthZPolicySource[] {
    const defaultCaller = this.callerResolver.resolve(
      this.defaultCallerPrincipal,
      this.defaultCallerPrincipal,
    );

    if (defaultCaller.arn === undefined || caller.arn !== defaultCaller.arn) {
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
