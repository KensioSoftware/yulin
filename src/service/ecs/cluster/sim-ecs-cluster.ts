import type { SimArn } from "../../aws/arn.js";
import type { SimEcsTag } from "../task-definition/sim-ecs-task-definition-parts.js";

/**
 * Minimal structural sim ECS cluster setting.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ClusterSetting.html
 */
export interface SimEcsClusterSetting {
  readonly name?: string | undefined;
  readonly value?: string | undefined;
}

/**
 * Minimal structural sim ECS described cluster.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_Cluster.html
 */
export interface SimEcsClusterDetail {
  readonly clusterArn?: SimArn | undefined;
  readonly clusterName?: string | undefined;
  readonly status?: SimEcsClusterStatus | undefined;
  readonly registeredContainerInstancesCount?: number | undefined;
  readonly runningTasksCount?: number | undefined;
  readonly pendingTasksCount?: number | undefined;
  readonly activeServicesCount?: number | undefined;
  readonly statistics?: readonly SimEcsKeyValueString[] | undefined;
  readonly settings?: readonly SimEcsClusterSetting[] | undefined;
  readonly configuration?: object | undefined;
  readonly tags?: readonly SimEcsTag[] | undefined;
  readonly capacityProviders?: readonly string[] | undefined;
  readonly defaultCapacityProviderStrategy?: readonly object[] | undefined;
}

/**
 * Minimal structural sim ECS statistic entry.
 */
export interface SimEcsKeyValueString {
  readonly name?: string | undefined;
  readonly value?: string | undefined;
}

/**
 * The states a simulated ECS cluster can be in.
 */
export type SimEcsClusterStatus = "ACTIVE" | "INACTIVE";

interface SimEcsClusterProperties {
  readonly clusterArn: SimArn;
  readonly clusterName: string;
  readonly settings?: readonly SimEcsClusterSetting[] | undefined;
  readonly configuration?: object | undefined;
  readonly tags?: readonly SimEcsTag[] | undefined;
}

/**
 * One simulated ECS cluster.
 *
 * A cluster is little more than a named scope for the tasks and services that
 * will run in it. It holds no capacity here, because there is nothing to hold:
 * a simulated task runs in this process rather than on an instance, so the
 * counts a described cluster reports are the ones it can honestly report.
 */
export class SimEcsCluster {
  public readonly clusterArn: SimArn;
  public readonly clusterName: string;

  private status: SimEcsClusterStatus = "ACTIVE";
  private readonly settings: readonly SimEcsClusterSetting[];
  private readonly configuration: object | undefined;
  private readonly tags: readonly SimEcsTag[];

  constructor(properties: SimEcsClusterProperties) {
    this.clusterArn = properties.clusterArn;
    this.clusterName = properties.clusterName;
    this.settings = structuredClone(properties.settings ?? []);
    this.configuration = structuredClone(properties.configuration);
    this.tags = structuredClone(properties.tags ?? []);
  }

  /**
   * Whether this cluster is still the one a request naming it reaches.
   */
  isActive(): boolean {
    return this.status === "ACTIVE";
  }

  /**
   * Mark this cluster deleted.
   *
   * It stays describable as `INACTIVE` rather than being removed, which is
   * what real ECS does with a deleted cluster: something holding its ARN can
   * still find out what became of it.
   */
  markDeleted(): void {
    this.status = "INACTIVE";
  }

  /**
   * This cluster as `DescribeClusters` reports it.
   *
   * Tags and settings are only reported when the request asked for them, as
   * real ECS only reports them under the matching `include` value.
   */
  toOutput(included: SimEcsClusterIncludes): SimEcsClusterDetail {
    return {
      clusterArn: this.clusterArn,
      clusterName: this.clusterName,
      status: this.status,
      registeredContainerInstancesCount: 0,
      runningTasksCount: 0,
      pendingTasksCount: 0,
      activeServicesCount: 0,
      statistics: [],
      capacityProviders: [],
      defaultCapacityProviderStrategy: [],
      settings: included.settings ? structuredClone(this.settings) : [],
      tags: included.tags ? structuredClone(this.tags) : [],
      ...(included.configuration &&
        this.configuration !== undefined && {
          configuration: structuredClone(this.configuration),
        }),
    };
  }
}

/**
 * Which parts of a cluster a describe request asked to be reported.
 */
export interface SimEcsClusterIncludes {
  readonly settings: boolean;
  readonly configuration: boolean;
  readonly tags: boolean;
}
