import type { SimStatesDefinition } from "../definition/sim-states-definition.js";
import type { SimStateMachineTags } from "./sim-state-machine-tags.js";

/**
 * The two kinds of state machine real Step Functions runs.
 *
 * Only `STANDARD` runs here. An `EXPRESS` state machine is accepted and runs
 * the standard way, and the docs record that divergence.
 */
export type SimStateMachineType = "STANDARD" | "EXPRESS";

interface SimStateMachineProperties {
  readonly arn: string;
  readonly name: string;
  readonly roleArn: string;
  readonly definition: string;
  readonly parsed: SimStatesDefinition;
  readonly type: SimStateMachineType;
  readonly creationDate: Date;
  readonly tags: SimStateMachineTags;
}

/**
 * One simulated state machine.
 *
 * The definition is held both as the string it arrived as and as the checked
 * form an execution walks. `DescribeStateMachine` answers with the string, and
 * a caller comparing it against what it deployed gets back what it sent.
 */
export class SimStateMachine {
  readonly arn: string;
  readonly name: string;

  /**
   * The tags this state machine holds, which the tag commands read and write.
   */
  readonly tags: SimStateMachineTags;

  readonly #creationDate: Date;

  #roleArn: string;
  #definition: string;
  #parsed: SimStatesDefinition;
  readonly #type: SimStateMachineType;

  constructor(properties: SimStateMachineProperties) {
    this.arn = properties.arn;
    this.name = properties.name;
    this.#creationDate = new Date(properties.creationDate);
    this.#roleArn = properties.roleArn;
    this.#definition = properties.definition;
    this.#parsed = properties.parsed;
    this.#type = properties.type;
    this.tags = properties.tags;
  }

  /**
   * When this state machine was created.
   *
   * A copy, because a `Date` is mutable and this one is read back by every
   * `DescribeStateMachine`.
   */
  get creationDate(): Date {
    return new Date(this.#creationDate);
  }

  get roleArn(): string {
    return this.#roleArn;
  }

  get definition(): string {
    return this.#definition;
  }

  get parsedDefinition(): SimStatesDefinition {
    return this.#parsed;
  }

  get type(): SimStateMachineType {
    return this.#type;
  }

  /**
   * Take a new definition or role.
   *
   * Real `UpdateStateMachine` leaves anything the request omits as it was, and
   * an execution already running carries on with the definition it started on.
   */
  update(changes: {
    readonly roleArn?: string | undefined;
    readonly definition?: string | undefined;
    readonly parsed?: SimStatesDefinition | undefined;
  }): void {
    this.#roleArn = changes.roleArn ?? this.#roleArn;

    if (changes.definition !== undefined && changes.parsed !== undefined) {
      this.#definition = changes.definition;
      this.#parsed = changes.parsed;
    }
  }
}
