import { assertDefined } from "../../../../util/type-guard/defined.js";
import { parseSimArn } from "../../../aws/arn.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimElbV2TargetGroup } from "../../../elbv2/target-group/sim-elbv2-target-group.js";
import type {
  SimEcsRegistrableTargetGroup,
  SimEcsTargetGroups,
  SimEcsTaskTarget,
} from "./sim-ecs-target-groups.js";

interface SimAwsEcsTargetGroupsProperties {
  readonly simAws: SimAws;
}

/**
 * One simulated ELBv2 target group, as a service registers its tasks into it.
 *
 * The targets are written to the group itself rather than sent as a
 * `RegisterTargets` request, because there is no caller: real ECS registers a
 * task through the service-linked role, which is not something a test holds.
 * What the group would refuse, it still refuses, since registering is the
 * target group's own operation either way.
 */
class SimAwsEcsRegistrableTargetGroup implements SimEcsRegistrableTargetGroup {
  public readonly targetType: string;

  private readonly targetGroup: SimElbV2TargetGroup;

  constructor(targetGroup: SimElbV2TargetGroup) {
    this.targetGroup = targetGroup;
    this.targetType = targetGroup.targetType.value;
  }

  register(target: SimEcsTaskTarget): void {
    this.targetGroup.register([{ Id: target.address, Port: target.port }]);
  }

  deregister(target: SimEcsTaskTarget): void {
    this.targetGroup.deregister([{ Id: target.address, Port: target.port }]);
  }
}

/**
 * The simulated ELBv2 target groups of one simulated AWS instance, as the
 * places a service's tasks are registered.
 *
 * ELBv2 is reached when a service is created or a task starts, never when this
 * is built, for the same reason simulated ECS reaches its secret stores that
 * way: reaching another service while this one is being constructed is a cycle
 * with no bottom to it.
 *
 * A target group is looked for in the Account and Region its own ARN names.
 * Nothing else would be right for an ARN, and a service is refused a target
 * group outside its own scope before it ever gets here.
 */
export class SimAwsEcsTargetGroups implements SimEcsTargetGroups {
  private readonly simAws: SimAws;

  constructor(properties: SimAwsEcsTargetGroupsProperties) {
    this.simAws = properties.simAws;
  }

  /**
   * The target group an ARN names, where this simulation holds one.
   */
  find(targetGroupArn: string): SimEcsRegistrableTargetGroup | undefined {
    const parts = parseSimArn(targetGroupArn);

    // A service reads its registrations before it is created, and one naming
    // anything but a target group ARN of its own scope is refused there.
    assertDefined(parts, `'${targetGroupArn}' is not a target group ARN`);

    const targetGroup = this.simAws
      .accountRegionScope(parts.accountId, parts.region)
      .elbV2()
      .findTargetGroupByArn(targetGroupArn);

    if (targetGroup === undefined) {
      return undefined;
    }

    return new SimAwsEcsRegistrableTargetGroup(targetGroup);
  }
}
