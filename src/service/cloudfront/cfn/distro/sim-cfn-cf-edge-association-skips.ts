import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
  SimCloudFrontLambdaFunctionAssociation,
} from "../../command/create-distribution/create-distribution.command.js";
import { normalizeSimCfList } from "../../command/create-distribution/sim-cf-normalize-list.js";
import { simCfnCfEdgeSkipReason } from "./sim-cfn-cf-edge-skip-reason.js";

/**
 * Leaves out the Lambda@Edge associations of a template Behavior this
 * simulation cannot run, recording each one on the CloudFormation Resource.
 *
 * Which those are is `simCfnCfEdgeSkipReason`'s to say. This is the
 * bookkeeping around it: reading the list a template wrote, counting what a
 * Behavior has to be rewritten for, and recording each skip under the path and
 * the event type it was on.
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
    const eventType = association.EventType;
    const reason = simCfnCfEdgeSkipReason(association, {
      simAws: this.simAws,
      stackResourceLogicalIds: this.resource.stackResourceLogicalIds,
    });

    if (reason === undefined || eventType === undefined) {
      return true;
    }

    this.count += 1;
    this.resource.ignoreProperty(
      `${behaviorPath}.LambdaFunctionAssociations.${eventType}`,
      reason,
    );

    return false;
  }
}
