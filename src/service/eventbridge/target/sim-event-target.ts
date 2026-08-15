import { SimEventBridgeValidationException } from "../error/sim-event-bridge.error.js";
import { SimEventTargetArn } from "./sim-event-target-arn.js";
import {
  SimEventTargetEcs,
  type SimEventTargetTaskProperties,
} from "./sim-event-target-ecs.js";

/**
 * Real EventBridge allows alphanumerics, full stops, hyphens and underscores,
 * up to 64 characters, for a target id.
 */
const targetIdPattern = /^[.\-_A-Za-z0-9]{1,64}$/;

interface SimEventTargetProperties {
  readonly id: string;
  readonly arn: SimEventTargetArn;
  readonly input: string | undefined;
  readonly ecs: SimEventTargetEcs | undefined;
}

/**
 * One place a rule sends the events it matches.
 *
 * A target's id is how it is replaced and removed, and it is unique within one
 * rule rather than globally. Two rules may each have a target called `main`,
 * and one rule may send the same event to two targets with different ids and
 * the same ARN.
 */
export class SimEventTarget {
  public readonly id: string;
  public readonly arn: SimEventTargetArn;

  /**
   * The fixed JSON this target receives instead of the event, where one was
   * set.
   *
   * Real EventBridge sends the value as written, so a target with an `Input`
   * of `"hello"` receives the JSON string rather than the event that triggered
   * it. That is what makes `Input` useful for a target which only needs to
   * know that something happened.
   */
  public readonly input: string | undefined;

  /**
   * What this target says about the ECS task it runs, where it runs one.
   *
   * An ECS target is the one target type here whose `Input` is not what the
   * target receives: a task has nowhere to receive a payload, so the `Input`
   * is what the task overrides instead.
   */
  public readonly ecs: SimEventTargetEcs | undefined;

  private constructor(properties: SimEventTargetProperties) {
    this.id = properties.id;
    this.arn = properties.arn;
    this.input = properties.input;
    this.ecs = properties.ecs;
  }

  /**
   * Read a target from request input.
   */
  static of(
    properties: SimEventTargetTaskProperties & {
      readonly Id?: string | undefined;
      readonly Arn?: string | undefined;
    },
  ): SimEventTarget {
    const arn = SimEventTargetArn.of(properties.Arn);

    return new this({
      id: this.requiredId(properties.Id),
      arn,
      input: this.readInput(properties.Input),
      ecs: SimEventTargetEcs.of(arn, properties),
    });
  }

  /**
   * Read a target's fixed input, which has to be JSON.
   *
   * Checked here rather than at delivery, because a target that cannot be
   * delivered to should say so when it is added, and because a delivery
   * failing on a parse would be reported as the target refusing the event.
   */
  private static readInput(input: string | undefined): string | undefined {
    if (input === undefined) {
      return undefined;
    }

    try {
      JSON.parse(input);
    } catch {
      throw new SimEventBridgeValidationException(
        `Invalid parameter: Target Input Reason: the input is not valid JSON`,
      );
    }

    return input;
  }

  /**
   * Read the id a target has to carry.
   */
  private static requiredId(id: string | undefined): string {
    if (id === undefined || id === "") {
      throw new SimEventBridgeValidationException(
        "Invalid parameter: Target Id is required",
      );
    }

    if (!targetIdPattern.test(id)) {
      throw new SimEventBridgeValidationException(
        `Invalid parameter: Target Id Reason: '${id}' is not a valid target ` +
          `id. Target ids are made up of only letters, numbers, full stops, ` +
          `hyphens and underscores, and are between 1 and 64 characters long.`,
      );
    }

    return id;
  }
}
