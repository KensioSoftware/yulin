import { isRecord } from "../../../../util/type-guard/record.js";
import { SimEventBridgeValidationException } from "../../error/sim-event-bridge.error.js";
import { SimEventPattern } from "../../pattern/sim-event-pattern.js";
import type { SimEventBridgeAuthorizer } from "../authorize/sim-event-bridge-authorizer.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";
import type {
  SimTestEventPatternCommand,
  SimTestEventPatternCommandOutput,
} from "./rule.command.js";

interface SimEventBridgeTestEventPatternProperties {
  readonly authorizer: SimEventBridgeAuthorizer;
}

/**
 * The TestEventPattern command.
 *
 * This is the operation for finding out why a rule is not firing, without
 * putting an event and watching nothing happen. It creates nothing and reads
 * nothing: a pattern and an event go in, and whether the one matches the other
 * comes back.
 *
 * A pattern this simulation cannot evaluate is refused here exactly as PutRule
 * refuses it, which is what makes this a way to check a pattern before writing
 * a rule with it.
 */
export class SimEventBridgeTestEventPattern {
  private readonly authorizer: SimEventBridgeAuthorizer;

  constructor(properties: SimEventBridgeTestEventPatternProperties) {
    this.authorizer = properties.authorizer;
  }

  /**
   * Read the event to test, which is the JSON of a whole event rather than
   * just its detail.
   */
  private static eventIn(source: string): Record<string, unknown> {
    let parsed: unknown;

    try {
      parsed = JSON.parse(source);
    } catch {
      throw new SimEventBridgeValidationException(
        "Invalid parameter: Event Reason: the event is not valid JSON",
      );
    }

    if (!isRecord(parsed)) {
      throw new SimEventBridgeValidationException(
        "Invalid parameter: Event Reason: an event is a JSON object",
      );
    }

    return parsed;
  }

  private static required(value: string | undefined, name: string): string {
    if (value === undefined || value === "") {
      throw new SimEventBridgeValidationException(
        `Invalid parameter: ${name} is required`,
      );
    }

    return value;
  }

  /**
   * Test whether an event matches a pattern.
   */
  handle(
    command: SimTestEventPatternCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimTestEventPatternCommandOutput {
    const input = command.input;

    this.authorizer.authorizeAnyBus("events:TestEventPattern", options);

    const pattern = SimEventPattern.of(
      SimEventBridgeTestEventPattern.required(
        input.EventPattern,
        "EventPattern",
      ),
    );
    const event = SimEventBridgeTestEventPattern.eventIn(
      SimEventBridgeTestEventPattern.required(input.Event, "Event"),
    );

    return { $metadata: {}, Result: pattern.matches(event) };
  }
}
