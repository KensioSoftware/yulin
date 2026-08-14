import type { SimEcsTaskDefinition } from "./sim-ecs-task-definition.js";

/**
 * The revisions registered under one simulated ECS task definition family.
 *
 * Revisions number from one and only ever go up. Deregistering a revision does
 * not free its number, because the number is part of an ARN that other things
 * hold: reusing it would point an existing ARN at a different declaration.
 */
export class SimEcsTaskDefinitionFamily {
  public readonly family: string;

  private readonly revisions: SimEcsTaskDefinition[] = [];

  constructor(family: string) {
    this.family = family;
  }

  /**
   * The number the next revision registered in this family will have.
   */
  nextRevisionNumber(): number {
    return this.revisions.length + 1;
  }

  /**
   * Hold a newly registered revision.
   */
  add(taskDefinition: SimEcsTaskDefinition): void {
    this.revisions.push(taskDefinition);
  }

  /**
   * Every revision ever registered in this family, oldest first.
   */
  all(): readonly SimEcsTaskDefinition[] {
    return this.revisions;
  }

  /**
   * Find one revision by number.
   */
  revision(revision: number): SimEcsTaskDefinition | undefined {
    return this.revisions.find((held) => held.revision === revision);
  }

  /**
   * The revision a request naming the family alone means.
   *
   * That is the highest numbered active one, which is not always the most
   * recently registered: deregistering the newest revision makes the one
   * before it current again.
   */
  latestActive(): SimEcsTaskDefinition | undefined {
    return this.revisions.findLast((held) => held.isActive());
  }

  /**
   * Whether any revision in this family is still active.
   */
  hasActiveRevision(): boolean {
    return this.latestActive() !== undefined;
  }
}
