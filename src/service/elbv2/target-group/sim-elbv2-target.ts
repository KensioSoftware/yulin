import { SimElbV2ValidationError } from "../error/sim-elbv2.error.js";

/**
 * Minimal structural sim ELBv2 target description.
 */
export interface SimElbV2TargetDescription {
  readonly Id?: string | undefined;
  readonly Port?: number | undefined;
  readonly AvailabilityZone?: string | undefined;
}

/**
 * One target registered in a simulated target group.
 *
 * Identity is the address and the port together, as it is on real ELB: the
 * same address registered on two ports is two targets, and deregistering one
 * leaves the other.
 */
export class SimElbV2Target {
  public readonly id: string;
  public readonly port: number | undefined;
  public readonly availabilityZone: string | undefined;

  private constructor(
    id: string,
    port: number | undefined,
    availabilityZone: string | undefined,
  ) {
    this.id = id;
    this.port = port;
    this.availabilityZone = availabilityZone;
  }

  /**
   * Read a target a request names, refusing one with no Id.
   *
   * A target naming no port takes the target group's, which is what real ELB
   * does, so a group listening on one port needs the port named once.
   */
  static read(
    target: SimElbV2TargetDescription,
    groupPort: number | undefined,
  ): SimElbV2Target {
    if (target.Id === undefined || target.Id === "") {
      throw new SimElbV2ValidationError("Targets member requires an Id");
    }

    return new SimElbV2Target(
      target.Id,
      target.Port ?? groupPort,
      target.AvailabilityZone,
    );
  }

  /**
   * How this target is told apart from the others in its group.
   */
  get key(): string {
    return `${this.id}:${String(this.port ?? "")}`;
  }

  /**
   * Report this target in the shape the SDK reads it back in.
   */
  view(): SimElbV2TargetDescription {
    return {
      Id: this.id,
      Port: this.port,
      AvailabilityZone: this.availabilityZone,
    };
  }
}
