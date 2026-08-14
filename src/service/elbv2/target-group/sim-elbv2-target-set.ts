import { SimElbV2TooManyTargetsException } from "../error/sim-elbv2.error.js";
import { SimElbV2Target } from "./sim-elbv2-target.js";
import type { SimElbV2TargetDescription } from "./sim-elbv2-target.js";
import type { SimElbV2TargetType } from "./sim-elbv2-target-type.js";

interface SimElbV2TargetSetProperties {
  readonly targetType: SimElbV2TargetType;
  readonly port: number | undefined;
}

/**
 * The targets registered in one simulated target group.
 *
 * This is where registering happens rather than on the group, because it is
 * the only part of a group that changes after it is created, and keeping it
 * here leaves the group itself immutable but for its health check settings.
 *
 * What a target may be is the target type's business: this asks the type and
 * counts, and never looks at an address or an ARN itself.
 */
export class SimElbV2TargetSet {
  private readonly targetType: SimElbV2TargetType;
  private readonly port: number | undefined;
  private readonly targets = new Map<string, SimElbV2Target>();

  constructor(properties: SimElbV2TargetSetProperties) {
    this.targetType = properties.targetType;
    this.port = properties.port;
  }

  /**
   * Every target in this set, in registration order.
   */
  get registered(): readonly SimElbV2Target[] {
    return this.targets.values().toArray();
  }

  /**
   * Register the targets a request names.
   *
   * Every target is read and checked before any is stored, so a request whose
   * second target is refused leaves the group as it was rather than half
   * registered.
   */
  register(descriptions: readonly SimElbV2TargetDescription[]): void {
    const registering = descriptions.map((description) => {
      const target = SimElbV2Target.read(description, this.port);

      this.targetType.validateTarget(target);

      return target;
    });

    this.requireRoom(registering);

    for (const target of registering) {
      this.targets.set(target.key, target);
    }
  }

  /**
   * Deregister the targets a request names.
   *
   * A target that was not registered is not an error on real ELB, and is not
   * one here either.
   */
  deregister(descriptions: readonly SimElbV2TargetDescription[]): void {
    for (const description of descriptions) {
      this.targets.delete(SimElbV2Target.read(description, this.port).key);
    }
  }

  private requireRoom(registering: readonly SimElbV2Target[]): void {
    const keys = new Set([
      ...this.targets.keys(),
      ...registering.map((target) => target.key),
    ]);

    if (keys.size > this.targetType.maximumTargets) {
      throw new SimElbV2TooManyTargetsException(
        `Registering these targets would leave the ${this.targetType.value} target group holding ${String(keys.size)}, and it holds at most ${String(this.targetType.maximumTargets)}`,
      );
    }
  }
}
