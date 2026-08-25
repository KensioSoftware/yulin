import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamCallerIdentifier } from "../../../iam/error/sim-iam-caller-identifier.js";
import { athenaWorkGroupArn } from "../../sim-athena-arn.js";
import { SimAthenaAccessDeniedException } from "../../error/sim-athena.error.js";
import type { SimAthenaRequestOptions } from "../sim-athena-request-options.js";

/**
 * The resource an action naming no workgroup authorizes against.
 *
 * `ListWorkGroups` names none, so IAM evaluates it against `*` and only a
 * policy whose Resource is `*` allows it.
 */
const noResource = "*";

interface SimAthenaAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Applies simulated IAM authorization to Athena requests.
 *
 * The resource is the workgroup ARN,
 * `arn:aws:athena:<region>:<account>:workgroup/<name>`. A named query has no
 * ARN of its own on real Athena, and work on one is authorized against the
 * workgroup it belongs to, so that is what this asks about too.
 */
export class SimAthenaAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly callerIdentifier = new SimIamCallerIdentifier();

  constructor(properties: SimAthenaAuthorizerProperties) {
    this.iam = properties.iam;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Ensure the caller may perform an action on a workgroup, named by name.
   *
   * The workgroup need not exist: `CreateWorkGroup` authorizes against the ARN
   * the workgroup is about to have.
   */
  authorizeWorkGroup(
    action: string,
    workGroupName: string,
    options?: SimAthenaRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(
      action,
      athenaWorkGroupArn(workGroupName, this.accountRegionScope),
      options,
    );
  }

  /**
   * Ensure the caller may perform an action naming no particular workgroup.
   */
  authorizeAnyWorkGroup(
    action: string,
    options?: SimAthenaRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, noResource, options);
  }

  private authorizeResource(
    action: string,
    resource: string,
    options: SimAthenaRequestOptions | undefined,
  ): SimAwsResolvedCaller {
    const decision = this.iam.authorize({
      action,
      resource,
      caller: options?.caller,
    });

    if (decision.isDenied) {
      const identifier = this.callerIdentifier.format(
        decision.caller.principal,
      );

      throw new SimAthenaAccessDeniedException(
        `User: ${identifier} is not authorized to perform: ${action} on ` +
          `resource: ${resource}`,
      );
    }

    return decision.caller;
  }
}
