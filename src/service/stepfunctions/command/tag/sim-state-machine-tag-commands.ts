import {
  SimStatesInvalidRequest,
  SimStatesTaggedResourceNotFound,
} from "../../error/sim-step-functions.error.js";
import type { SimStateMachine } from "../../machine/sim-state-machine.js";
import { parseSimStateMachineArn } from "../../machine/sim-state-machine-arn.js";
import type { SimStateMachineStore } from "../../machine/sim-state-machine-store.js";
import type {
  SimListTagsForResourceCommand,
  SimListTagsForResourceCommandOutput,
  SimTagResourceCommand,
  SimTagResourceCommandOutput,
  SimUntagResourceCommand,
  SimUntagResourceCommandOutput,
} from "./tag.command.js";

/**
 * The commands that tag, untag and list the tags of a resource.
 *
 * All three name their resource by ARN and reach it the same way, so an ARN
 * naming no state machine gives `ResourceNotFound` whichever of the three
 * asked. A tag request is read before the resource is reached, so a request
 * Step Functions would refuse is refused whether or not the state machine is
 * there.
 */
export class SimStateMachineTagCommands {
  readonly #stateMachines: SimStateMachineStore;

  constructor(stateMachines: SimStateMachineStore) {
    this.#stateMachines = stateMachines;
  }

  /**
   * Add tags to a resource, replacing the value of any key already there.
   */
  tagResource(command: SimTagResourceCommand): SimTagResourceCommandOutput {
    const tags = command.input.tags ?? [];
    const stateMachine = this.reach(command.input.resourceArn, "TagResource");

    stateMachine.tags.apply(tags);

    return {};
  }

  /**
   * Take tags off a resource.
   */
  untagResource(
    command: SimUntagResourceCommand,
  ): SimUntagResourceCommandOutput {
    const keys = command.input.tagKeys ?? [];
    const stateMachine = this.reach(command.input.resourceArn, "UntagResource");

    stateMachine.tags.remove(keys);

    return {};
  }

  /**
   * List the tags a resource holds.
   */
  listTagsForResource(
    command: SimListTagsForResourceCommand,
  ): SimListTagsForResourceCommandOutput {
    const stateMachine = this.reach(
      command.input.resourceArn,
      "ListTagsForResource",
    );

    return { tags: stateMachine.tags.ordered().map((tag) => tag.toTag()) };
  }

  /**
   * The state machine an ARN names, or why it could not be reached.
   *
   * A `states` ARN naming an activity or an execution parses as neither, and
   * is refused as an ARN this simulation tags nothing under. Only a state
   * machine holds tags here.
   */
  private reach(
    resourceArn: string | undefined,
    commandName: string,
  ): SimStateMachine {
    if (resourceArn === undefined || resourceArn === "") {
      throw new SimStatesInvalidRequest(`${commandName} needs a resourceArn.`);
    }

    if (parseSimStateMachineArn(resourceArn) === undefined) {
      throw new SimStatesInvalidRequest(
        `${resourceArn} is not a state machine ARN, and a state machine is ` +
          "the only Step Functions resource this simulation tags.",
      );
    }

    const stateMachine = this.#stateMachines.find(resourceArn);

    if (stateMachine === undefined) {
      throw new SimStatesTaggedResourceNotFound(
        `${resourceArn} is not a simulated state machine in this Account and Region.`,
      );
    }

    return stateMachine;
  }
}
