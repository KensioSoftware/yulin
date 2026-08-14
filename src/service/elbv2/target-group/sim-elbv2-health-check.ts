import type { SimElbV2Matcher } from "../command/sim-elbv2-shared.command.js";

/**
 * The health check settings a request can carry, on either a create or a
 * modify.
 */
export interface SimElbV2HealthCheckInput {
  readonly HealthCheckEnabled?: boolean | undefined;
  readonly HealthCheckProtocol?: string | undefined;
  readonly HealthCheckPort?: string | undefined;
  readonly HealthCheckPath?: string | undefined;
  readonly HealthCheckIntervalSeconds?: number | undefined;
  readonly HealthCheckTimeoutSeconds?: number | undefined;
  readonly HealthyThresholdCount?: number | undefined;
  readonly UnhealthyThresholdCount?: number | undefined;
  readonly Matcher?: SimElbV2Matcher | undefined;
}

/**
 * The health check settings of one simulated target group, as they are read
 * back.
 */
export type SimElbV2HealthCheckView = Required<{
  [Key in keyof SimElbV2HealthCheckInput]: SimElbV2HealthCheckInput[Key];
}>;

/**
 * The health check settings of one simulated target group.
 *
 * They are held and reported, and nothing acts on them: no request is ever
 * made to a target to find out whether it is up, so every registered target is
 * healthy here however it is configured. They are still worth holding, because
 * a stack declares them and a test comparing what it deployed against what it
 * meant to deploy needs to read them back.
 *
 * The defaults are the ones real ELB applies to an HTTP target group, except
 * that a `lambda` group starts with checking off, as real ELB has it.
 */
export class SimElbV2HealthCheck {
  private enabled: boolean;
  private protocol: string | undefined;
  private port: string | undefined;
  private path: string | undefined;
  private intervalSeconds: number;
  private timeoutSeconds: number;
  private healthyThresholdCount: number;
  private unhealthyThresholdCount: number;
  private matcher: SimElbV2Matcher | undefined;

  constructor(targetTypeValue: string) {
    const isLambda = targetTypeValue === "lambda";

    this.enabled = !isLambda;
    this.protocol = isLambda ? undefined : "HTTP";
    this.port = isLambda ? undefined : "traffic-port";
    this.path = isLambda ? undefined : "/";
    this.intervalSeconds = isLambda ? 35 : 30;
    this.timeoutSeconds = isLambda ? 30 : 5;
    this.healthyThresholdCount = 5;
    this.unhealthyThresholdCount = isLambda ? 5 : 2;
    this.matcher = isLambda ? undefined : { HttpCode: "200" };
  }

  /**
   * Take the settings a request names, leaving the others as they were.
   *
   * This is what makes `ModifyTargetGroup` a partial update, as real ELB has
   * it: a request naming only a path changes only the path.
   */
  apply(input: SimElbV2HealthCheckInput): void {
    this.enabled = input.HealthCheckEnabled ?? this.enabled;
    this.protocol = input.HealthCheckProtocol ?? this.protocol;
    this.port = input.HealthCheckPort ?? this.port;
    this.path = input.HealthCheckPath ?? this.path;
    this.intervalSeconds =
      input.HealthCheckIntervalSeconds ?? this.intervalSeconds;
    this.timeoutSeconds =
      input.HealthCheckTimeoutSeconds ?? this.timeoutSeconds;
    this.healthyThresholdCount =
      input.HealthyThresholdCount ?? this.healthyThresholdCount;
    this.unhealthyThresholdCount =
      input.UnhealthyThresholdCount ?? this.unhealthyThresholdCount;
    this.matcher = input.Matcher ?? this.matcher;
  }

  /**
   * Report these settings in the shape the SDK reads them back in.
   */
  view(): SimElbV2HealthCheckView {
    return {
      HealthCheckEnabled: this.enabled,
      HealthCheckProtocol: this.protocol,
      HealthCheckPort: this.port,
      HealthCheckPath: this.path,
      HealthCheckIntervalSeconds: this.intervalSeconds,
      HealthCheckTimeoutSeconds: this.timeoutSeconds,
      HealthyThresholdCount: this.healthyThresholdCount,
      UnhealthyThresholdCount: this.unhealthyThresholdCount,
      Matcher: this.matcher,
    };
  }
}
