import type { SimArn } from "../../aws/arn.js";

/**
 * The states a simulated ECS service can be in.
 *
 * Real ECS also has `DRAINING`, which a service passes through while its tasks
 * are being replaced. Nothing here takes any time to drain, so a service is
 * either the one requests reach or the one that has been deleted.
 */
export type SimEcsServiceStatus = "ACTIVE" | "INACTIVE";

/**
 * Minimal structural sim ECS described service.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_Service.html
 */
export interface SimEcsServiceDetail {
  readonly serviceArn?: SimArn | undefined;
  readonly serviceName?: string | undefined;
  readonly clusterArn?: SimArn | undefined;
  readonly status?: SimEcsServiceStatus | undefined;
  readonly desiredCount?: number | undefined;
  readonly runningCount?: number | undefined;
  readonly pendingCount?: number | undefined;
  readonly taskDefinition?: SimArn | undefined;
  readonly launchType?: string | undefined;
  readonly schedulingStrategy?: string | undefined;
  readonly loadBalancers?: readonly object[] | undefined;
  readonly serviceRegistries?: readonly object[] | undefined;
  readonly createdAt?: Date | undefined;
  readonly createdBy?: string | undefined;
}
