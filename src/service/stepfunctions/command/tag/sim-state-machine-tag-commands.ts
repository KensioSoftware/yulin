import {
  SimStatesInvalidRequest,
  SimStatesTaggedResourceNotFound,
} from "../../error/sim-step-functions.error.js";
import type { SimStateMachine } from "../../machine/sim-state-machine.js";
import { parseSimStateMachineArn } from "../../machine/sim-state-machine-arn.js";
import { readSimStatesTags } from "../../machine/sim-state-machine-tag.js";
import type { SimStateMachineStore } from "../../machine/sim-state-machine-store.js";
import type {
  SimListTagsForResourceCommand,
  SimListTagsForResourceCommandOutput,
  SimTagResourceCommand,
  SimTagResourceCommandOutput,
  SimUntagResourceCommand,
  SimUntagResourceCommandOutput,
} from "./tag.command.js";
import type { SimStepFunctionsAuthorizer } from "../authorize/sim-step-functions-authorizer.js";
import type { SimStepFunctionsRequestOptions } from "../sim-step-functions-request-options.js";
import {
  simStatesAuthorizeTagResource,
  simStatesAuthorizeUntagResource,
} from "./sim-states-request-tags.js";

interface SimStateMachineTagCommandsProperties {
  readonly stateMachines: SimStateMachineStore;
  readonly authorizer: SimStepFunctionsAuthorizer;
}

/**
 * The commands that tag, untag and list the tags of a resource.
 *
 * All three name their resource by ARN and reach it the same way, so an ARN
 * naming no state machine gives `ResourceNotFound` whichever of the three
 * asked. A tag request is read before the resource is reached, so a request
 * Step Functions would refuse is refused whether or not the state machine is
 * there.
 *
 * TagResource and UntagResource authorize their own actions, since the
 * condition values come from the request. TagResource gives IAM the tags it
 * sets as `aws:RequestTag/<key>` and `aws:TagKeys`, and UntagResource the
 * keys it removes as `aws:TagKeys`. ListTagsForResource is authorized by the
 * service, as every other read is.
 */
export class SimStateMachineTagCommands {
  readonly #stateMachines: SimStateMachineStore;
  readonly #authorizer: SimStepFunctionsAuthorizer;

  constructor(properties: SimStateMachineTagCommandsProperties) {
    this.#stateMachines = properties.stateMachines;
    this.#authorizer = properties.authorizer;
  }

  /**
   * Add tags to a resource, replacing the value of any key already there.
   */
  tagResource(
    command: SimTagResourceCommand,
    options?: SimStepFunctionsRequestOptions,
  ): SimTagResourceCommandOutput {
    simStatesAuthorizeTagResource(this.#authorizer, command.input, options);

    const { resourceArn, tags } = command.input;

    if (tags === undefined) {
      throw new SimStatesInvalidRequest("TagResource needs tags.");
    }

    // The request is read before the resource is reached, so a tag Step
    // Functions would refuse is refused whether or not the state machine is
    // there.
    const read = readSimStatesTags(tags);

    this.reach(resourceArn, "TagResource").tags.apply(read);

    return {};
  }

  /**
   * Take tags off a resource.
   */
  untagResource(
    command: SimUntagResourceCommand,
    options?: SimStepFunctionsRequestOptions,
  ): SimUntagResourceCommandOutput {
    simStatesAuthorizeUntagResource(this.#authorizer, command.input, options);

    const { resourceArn, tagKeys } = command.input;

    if (tagKeys === undefined) {
      throw new SimStatesInvalidRequest("UntagResource needs tagKeys.");
    }

    // An empty list is a request Step Functions takes. UntagResource asks for
    // a resource without the keys it names, and naming none of them asks for
    // the resource as it already is.
    this.reach(resourceArn, "UntagResource").tags.remove(tagKeys);

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
