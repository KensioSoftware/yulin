import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFrontCacheBehaviorConfig } from "../../command/create-distribution/create-distribution.command.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";
import {
  type BehaviorPolicyKind,
  behaviorPolicyKinds,
} from "./sim-cfn-cf-behavior-policy-kinds.js";

/**
 * Takes a policy ID naming a policy this simulation does not hold off the
 * Behavior that named it, and records each one on the Resource.
 */
export class SimCfnCfDistroPolicyDrops {
  public count = 0;

  constructor(
    private readonly resource: SimCfnResource,
    private readonly cloudFront: SimCloudFront,
  ) {}

  /**
   * One Behavior, keeping the policies that are here and dropping those that
   * are not.
   */
  heldPolicies(
    behavior: SimCloudFrontCacheBehaviorConfig,
    behaviorPath: string,
  ): SimCloudFrontCacheBehaviorConfig {
    return behaviorPolicyKinds.reduce(
      (held, kind) => this.heldPolicy(held, behaviorPath, kind),
      behavior,
    );
  }

  /**
   * One policy property of one Behavior, dropped where the ID names nothing
   * this simulation holds.
   */
  private heldPolicy(
    behavior: SimCloudFrontCacheBehaviorConfig,
    behaviorPath: string,
    kind: BehaviorPolicyKind,
  ): SimCloudFrontCacheBehaviorConfig {
    const policyId = behavior[kind.property];

    if (policyId === undefined || kind.held(this.cloudFront, policyId)) {
      return behavior;
    }

    this.count += 1;
    this.resource.ignoreProperty(
      `${behaviorPath}.${kind.property}`,
      `${kind.name} ${policyId} is not held by this simulation, so the ` +
        `Behavior is deployed without one and ${kind.loses}`,
    );

    return { ...behavior, [kind.property]: undefined };
  }
}
