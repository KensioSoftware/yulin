import type { SimArn } from "../../aws/arn.js";
import type { SimEcsContainerDefinitions } from "./container/sim-ecs-container-definitions.js";
import {
  simEcsTaskDefinitionDetail,
  type SimEcsTaskDefinitionDetail,
  type SimEcsTaskDefinitionStatus,
} from "./sim-ecs-task-definition-detail.js";
import type { SimEcsTag } from "./sim-ecs-task-definition-parts.js";
import type { SimEcsTaskDefinitionSettings } from "./sim-ecs-task-definition-settings.js";

interface SimEcsTaskDefinitionProperties {
  readonly taskDefinitionArn: SimArn;
  readonly family: string;
  readonly revision: number;
  readonly containers: SimEcsContainerDefinitions;
  readonly settings: SimEcsTaskDefinitionSettings;
  readonly tags: readonly SimEcsTag[];
  readonly registeredAt: Date;
  readonly registeredBy?: string | undefined;
}

/**
 * One revision of one simulated ECS task definition family.
 *
 * A revision is immutable once registered. The only thing that ever changes
 * about it is whether it is still active, because deregistering marks a
 * revision rather than removing it: something already holding the ARN can
 * still describe what it declared.
 */
export class SimEcsTaskDefinition {
  public readonly taskDefinitionArn: SimArn;
  public readonly family: string;
  public readonly revision: number;
  public readonly containers: SimEcsContainerDefinitions;
  public readonly settings: SimEcsTaskDefinitionSettings;
  public readonly registeredAt: Date;

  private readonly tags: readonly SimEcsTag[];
  private readonly registeredBy: string | undefined;
  private status: SimEcsTaskDefinitionStatus = "ACTIVE";
  private deregisteredAt: Date | undefined;

  constructor(properties: SimEcsTaskDefinitionProperties) {
    this.taskDefinitionArn = properties.taskDefinitionArn;
    this.family = properties.family;
    this.revision = properties.revision;
    this.containers = properties.containers;
    this.settings = properties.settings;
    this.tags = structuredClone(properties.tags);
    this.registeredAt = properties.registeredAt;
    this.registeredBy = properties.registeredBy;
  }

  /**
   * Whether this revision is one a family named on its own resolves to.
   */
  isActive(): boolean {
    return this.status === "ACTIVE";
  }

  /**
   * Mark this revision deregistered, at the simulation's current time.
   */
  markDeregistered(deregisteredAt: Date): void {
    this.status = "INACTIVE";
    this.deregisteredAt = deregisteredAt;
  }

  /**
   * The tags this revision was registered with.
   */
  toTagsOutput(): readonly SimEcsTag[] {
    return structuredClone(this.tags);
  }

  /**
   * This revision as `DescribeTaskDefinition` reports it.
   */
  toOutput(): SimEcsTaskDefinitionDetail {
    return simEcsTaskDefinitionDetail({
      settings: this.settings.toOutput(),
      taskDefinitionArn: this.taskDefinitionArn,
      family: this.family,
      revision: this.revision,
      status: this.status,
      containerDefinitions: this.containers.toOutput(),
      registeredAt: this.registeredAt,
      registeredBy: this.registeredBy,
      deregisteredAt: this.deregisteredAt,
    });
  }
}
