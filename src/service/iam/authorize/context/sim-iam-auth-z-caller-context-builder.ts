import {
  SimAwsCallerResolver,
  type SimAwsCredentialIdentityResolver,
  type SimAwsResolvedCaller,
} from "../../../aws/caller/sim-aws-caller-resolver.js";
import type {
  SimAwsCaller,
  SimAwsDefaultCaller,
  SimAwsPrincipal,
} from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamAuthZPolicySource } from "./sim-iam-auth-z-context.js";

export interface SimIamAuthZCallerContext {
  readonly caller: SimAwsResolvedCaller;
  readonly rootPolicySources: readonly SimIamAuthZPolicySource[];
}

/**
 * What building a caller context needs beyond the request's own caller.
 */
export interface SimIamAuthZCallerContextBuilderProperties {
  /**
   * The root principal of the Account deciding the request.
   *
   * This is both the last fallback for a request that names no caller and the
   * principal holding the Account's intrinsic unrestricted access. The default
   * caller stands apart from it. Naming a default says who an unattributed
   * call comes from, and leaves the root's own access where AWS puts it.
   */
  readonly accountRootPrincipal: SimAwsPrincipal;

  readonly credentialIdentityResolver: SimAwsCredentialIdentityResolver;

  /**
   * The caller this simulation attributes an unattributed request to.
   */
  readonly defaultCaller?: SimAwsDefaultCaller | undefined;
}

/**
 * Resolves the caller and any policy sources implied by that caller.
 *
 * A request that omits a caller is decided as the simulation's default caller,
 * and as the Account root where the simulation named none. An explicit
 * anonymous caller falls back to neither.
 */
export class SimIamAuthZCallerContextBuilder {
  private readonly callerResolver: SimAwsCallerResolver;
  private readonly accountRootPrincipal: SimAwsPrincipal;
  private readonly accountRootArn?: string | undefined;

  constructor(properties: SimIamAuthZCallerContextBuilderProperties) {
    const root = properties.accountRootPrincipal;

    this.accountRootPrincipal = root;
    this.accountRootArn = root.kind === "arn" ? root.arn : undefined;
    this.callerResolver = new SimAwsCallerResolver({
      credentialIdentityResolver: properties.credentialIdentityResolver,
      defaultCaller: properties.defaultCaller,
    });
  }

  /**
   * Resolve request caller data and add the simulated root policy when
   * applicable.
   */
  build(caller: SimAwsCaller | undefined): SimIamAuthZCallerContext {
    const resolvedCaller = this.callerResolver.resolve(
      caller,
      this.accountRootPrincipal,
    );

    return {
      caller: resolvedCaller,
      rootPolicySources: this.rootPolicySources(resolvedCaller),
    };
  }

  /**
   * Give the Account's root principal unrestricted identity access.
   *
   * The comparison names the root principal explicitly, so a simulation with a
   * default caller keeps this access on the root where AWS has it.
   */
  private rootPolicySources(
    caller: SimAwsResolvedCaller,
  ): readonly SimIamAuthZPolicySource[] {
    if (
      this.accountRootArn === undefined ||
      caller.arn !== this.accountRootArn
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
