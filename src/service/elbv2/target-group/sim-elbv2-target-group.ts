import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimElbV2HealthCheck,
  type SimElbV2HealthCheckInput,
  type SimElbV2HealthCheckView,
} from "./sim-elbv2-health-check.js";
import type {
  SimElbV2Target,
  SimElbV2TargetDescription,
} from "./sim-elbv2-target.js";
import { SimElbV2TargetSet } from "./sim-elbv2-target-set.js";
import type { SimElbV2TargetType } from "./sim-elbv2-target-type.js";

interface SimElbV2TargetGroupProperties {
  readonly name: string;
  readonly id: string;
  readonly targetType: SimElbV2TargetType;
  readonly protocol: string | undefined;
  readonly port: number | undefined;
  readonly vpcId: string | undefined;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * A simulated target group as the SDK reads it back.
 */
export type SimElbV2TargetGroupView = SimElbV2HealthCheckView & {
  readonly TargetGroupArn: string;
  readonly TargetGroupName: string;
  readonly TargetType: string;
  readonly Protocol?: string | undefined;
  readonly Port?: number | undefined;
  readonly VpcId?: string | undefined;
  readonly LoadBalancerArns: readonly string[];
};

/**
 * One simulated target group, and the targets registered in it.
 *
 * The target type owns what this group will take, so nothing here branches on
 * whether it holds a function or an address: registration asks the type, and
 * the type refuses what it would not hold.
 */
export class SimElbV2TargetGroup {
  public readonly name: string;
  public readonly arn: string;
  public readonly targetType: SimElbV2TargetType;
  public readonly protocol: string | undefined;
  public readonly port: number | undefined;
  public readonly vpcId: string | undefined;

  private readonly healthCheck: SimElbV2HealthCheck;
  private readonly targets: SimElbV2TargetSet;

  constructor(properties: SimElbV2TargetGroupProperties) {
    const { accountRegionScope } = properties;

    this.name = properties.name;
    this.targetType = properties.targetType;
    this.protocol = properties.protocol;
    this.port = properties.port;
    this.vpcId = properties.vpcId;
    this.arn = `arn:aws:elasticloadbalancing:${accountRegionScope.regionName}:${accountRegionScope.accountId}:targetgroup/${properties.name}/${properties.id}`;
    this.healthCheck = new SimElbV2HealthCheck(properties.targetType.value);
    this.targets = new SimElbV2TargetSet({
      targetType: properties.targetType,
      port: properties.port,
    });
  }

  /**
   * Every target registered in this group, in registration order.
   */
  get registeredTargets(): readonly SimElbV2Target[] {
    return this.targets.registered;
  }

  /**
   * Change the health check settings a request names.
   */
  modifyHealthCheck(input: SimElbV2HealthCheckInput): void {
    this.healthCheck.apply(input);
  }

  /**
   * Register the targets a request names.
   */
  register(descriptions: readonly SimElbV2TargetDescription[]): void {
    this.targets.register(descriptions);
  }

  /**
   * Deregister the targets a request names.
   */
  deregister(descriptions: readonly SimElbV2TargetDescription[]): void {
    this.targets.deregister(descriptions);
  }

  /**
   * Report this target group in the shape the SDK reads it back in.
   */
  view(loadBalancerArns: readonly string[]): SimElbV2TargetGroupView {
    return {
      ...this.healthCheck.view(),
      TargetGroupArn: this.arn,
      TargetGroupName: this.name,
      TargetType: this.targetType.value,
      Protocol: this.protocol,
      Port: this.port,
      VpcId: this.vpcId,
      LoadBalancerArns: loadBalancerArns,
    };
  }
}
