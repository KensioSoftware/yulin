import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
  SimCloudFrontLambdaFunctionAssociation,
} from "../../command/create-distribution/create-distribution.command.js";
import { normalizeSimCfList } from "../../command/create-distribution/sim-cf-normalize-list.js";
import { isSimulatedEdgeEventType } from "../../edge/sim-cf-edge-association-checks.js";
import { readEdgeFunctionArnParts } from "../../edge/sim-cf-edge-function-arn.js";
import { findSimCfEdgeFunctionVersion } from "../../edge/sim-cf-edge-function-version.js";

/**
 * Decides which of a template Behavior's Lambda@Edge associations this
 * simulation can run, recording the rest on the CloudFormation Resource.
 *
 * An association is left out for two reasons. One names a function version
 * this simulation does not hold, as a template pointing at a function in a
 * real account does. The other is on an event type this simulation has no hook
 * for.
 *
 * Everything else is left where `CreateDistribution` meets it, including the
 * mistakes real CloudFront refuses. A template carrying one of those fails a
 * real deploy too.
 */
export class SimCfnCfEdgeAssociationSkips {
  /** How many associations have been left out so far. */
  public count = 0;

  constructor(
    private readonly resource: SimCfnResource,
    private readonly simAws: SimAws,
  ) {}

  /**
   * The associations of one Behavior this simulation can run, answering with
   * nothing where it can run all of them and the Behavior needs no rewriting.
   *
   * The list is read through the normalizer, because a template writes it as a
   * plain array where the CloudFront API writes the Quantity and Items pair,
   * and both arrive here.
   */
  runnableAssociations(
    behavior:
      | SimCloudFrontDefaultCacheBehaviorConfig
      | SimCloudFrontCacheBehaviorConfig,
    behaviorPath: string,
  ): readonly SimCloudFrontLambdaFunctionAssociation[] | undefined {
    const items = normalizeSimCfList<SimCloudFrontLambdaFunctionAssociation>(
      "LambdaFunctionAssociations",
      behavior.LambdaFunctionAssociations,
    )?.Items;

    if (items === undefined) {
      return undefined;
    }

    const runnable = items.filter((association) =>
      this.canRun(association, behaviorPath),
    );

    if (runnable.length === items.length) {
      return undefined;
    }

    return runnable;
  }

  /**
   * Whether this simulation can run one association, recording it where it
   * cannot.
   */
  private canRun(
    association: SimCloudFrontLambdaFunctionAssociation,
    behaviorPath: string,
  ): boolean {
    const { EventType, LambdaFunctionARN } = association;

    if (EventType === undefined || LambdaFunctionARN === undefined) {
      return true;
    }

    if (!isSimulatedEdgeEventType(EventType)) {
      return this.skip(
        behaviorPath,
        EventType,
        `simulated CloudFront runs a Lambda@Edge function at viewer-request ` +
          `and viewer-response, so the Behavior is deployed without the ` +
          `${EventType} function ${LambdaFunctionARN} and runs nothing there`,
      );
    }

    const arn = readEdgeFunctionArnParts(LambdaFunctionARN);

    if (arn === undefined) {
      return true;
    }

    if (findSimCfEdgeFunctionVersion(this.simAws, arn) !== undefined) {
      return true;
    }

    return this.skip(
      behaviorPath,
      EventType,
      `Lambda@Edge function ${LambdaFunctionARN} is not held by this ` +
        `simulation, so the Behavior is deployed without it and runs nothing ` +
        `at ${EventType}`,
    );
  }

  /**
   * Record one skipped association, answering with what a filter does about
   * it.
   */
  private skip(
    behaviorPath: string,
    eventType: string,
    reason: string,
  ): boolean {
    this.count += 1;
    this.resource.ignoreProperty(
      `${behaviorPath}.LambdaFunctionAssociations.${eventType}`,
      reason,
    );

    return false;
  }
}
