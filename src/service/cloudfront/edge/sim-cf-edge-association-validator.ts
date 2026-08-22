import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
  SimCloudFrontDistributionConfig,
} from "../command/create-distribution/create-distribution.command.js";
import {
  assertNoViewerFunctionMix,
  assertSimulatedEventType,
} from "./sim-cf-edge-association-checks.js";
import { edgeFunctionArnParts } from "./sim-cf-edge-function-arn.js";
import type { SimCfEdgeFunctions } from "./sim-cf-edge-functions.js";

/**
 * What a caller needs on the function version to put it in front of a
 * Distribution.
 *
 * `GetFunction` is how CloudFront reads the code and configuration, and
 * `EnableReplication` is what lets the replication service copy it out to the
 * edge. A policy written the way the AWS docs write it grants
 * `lambda:EnableReplication*`, which matches this.
 */
const associationActions = ["lambda:GetFunction", "lambda:EnableReplication"];

interface SimCfEdgeAssociationValidatorProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly edgeFunctions?: SimCfEdgeFunctions | undefined;
}

/**
 * Checks the Lambda@Edge associations a DistributionConfig asks for.
 *
 * Real CloudFront refuses all of these when the Distribution is written rather
 * than when a request arrives, and that is the point of doing it here. An
 * association CloudFront would have refused otherwise turns into a test that
 * passes with the edge function never running.
 *
 * With no edge functions collaborator there is no simulated Lambda to look
 * anything up in, as in a standalone `SimCloudFront`, so the ARN itself is
 * still checked and the function behind it is not.
 */
export class SimCfEdgeAssociationValidator {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly edgeFunctions: SimCfEdgeFunctions | undefined;

  constructor(properties: SimCfEdgeAssociationValidatorProperties) {
    this.iam = properties.iam;
    this.edgeFunctions = properties.edgeFunctions;
  }

  /**
   * Validate every Behavior of a DistributionConfig.
   */
  async validate(
    distributionConfig: SimCloudFrontDistributionConfig,
    caller?: SimAwsCaller,
  ): Promise<void> {
    const associated: string[] = [];

    for (const behavior of behaviors(distributionConfig)) {
      associated.push(...this.checkBehavior(behavior, caller));
    }

    const edgeFunctions = this.edgeFunctions;

    if (edgeFunctions === undefined) {
      return;
    }

    // Every check above reads the config alone. Reaching the function behind
    // each ARN is the only part that waits on anything, and one Behavior's
    // functions have nothing to say about another's.
    await Promise.all(
      associated.map(async (functionArn) => {
        await edgeFunctions.assertAssociable(functionArn);
      }),
    );
  }

  /**
   * Check what one Behavior's config says, answering with the function ARNs it
   * associates.
   */
  private checkBehavior(
    behavior:
      | SimCloudFrontDefaultCacheBehaviorConfig
      | SimCloudFrontCacheBehaviorConfig,
    caller?: SimAwsCaller,
  ): string[] {
    const associations = behavior.LambdaFunctionAssociations?.Items ?? [];

    if (associations.length === 0) {
      return [];
    }

    assertNoViewerFunctionMix(behavior);

    const functionArns: string[] = [];

    for (const association of associations) {
      assertSimulatedEventType(association.EventType);

      const functionArn = association.LambdaFunctionARN;

      if (functionArn === undefined) {
        continue;
      }

      // Read for the refusals reading it produces. The parts themselves
      // matter only where the function behind the ARN is looked up.
      edgeFunctionArnParts(functionArn);
      this.authorize(functionArn, caller);
      functionArns.push(functionArn);
    }

    return functionArns;
  }

  /**
   * Check the caller may put this function version in front of a
   * Distribution.
   */
  private authorize(functionArn: string, caller?: SimAwsCaller): void {
    for (const action of associationActions) {
      const decision = this.iam.authorize({
        action,
        resource: functionArn,
        caller,
      });

      if (decision.isDenied) {
        throw new SimIamAccessDenied({
          principal: decision.caller.principal,
          action,
          resource: functionArn,
        });
      }
    }
  }
}

/**
 * Every Behavior a DistributionConfig describes, default one first.
 */
function behaviors(
  distributionConfig: SimCloudFrontDistributionConfig,
): (
  | SimCloudFrontDefaultCacheBehaviorConfig
  | SimCloudFrontCacheBehaviorConfig
)[] {
  return [
    ...(distributionConfig.DefaultCacheBehavior === undefined
      ? []
      : [distributionConfig.DefaultCacheBehavior]),
    ...(distributionConfig.CacheBehaviors?.Items ?? []),
  ];
}
