import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "../../sim-cfn-sam-record.js";
import { samConditionAttribute } from "../sim-cfn-sam-function-properties.js";
import { samEventBridgeRuleEventResources } from "./sim-cfn-sam-event-bridge-rule-event.js";
import { samHttpApiEventResources } from "./sim-cfn-sam-http-api-event.js";
import { samScheduleEventResources } from "./sim-cfn-sam-schedule-event.js";
import { samScheduleV2EventResources } from "./sim-cfn-sam-schedule-v2-event.js";

interface SamFunctionEventsProperties {
  /** The logical ID of the SAM function whose events these are. */
  readonly logicalId: string;
  /** The function properties, with the `Globals` defaults already merged in. */
  readonly functionProperties: SimCfnTemplateValueRecord;
  /** The `Condition` the SAM Resource carried, where it carried one. */
  readonly condition: SimCfnTemplateValue | undefined;
}

/**
 * What an expansion is told about the event it is expanding.
 */
export interface SamFunctionEvent {
  /**
   * The logical ID of the SAM function the event is declared on, which is also
   * the logical ID of the Lambda function it is expanded into.
   */
  readonly functionLogicalId: string;
  /** The name the function declared the event under in `Events`. */
  readonly eventName: string;
  /**
   * The `Properties` of the event. An event stating none states an empty
   * record.
   */
  readonly properties: SimCfnTemplateValueRecord;
  /**
   * The `Condition` attribute to put on the Resources that exist only because
   * this function does, ready to spread. A function carrying no condition
   * supplies nothing.
   */
  readonly condition: SimCfnTemplateValueRecord;
}

/**
 * What one event type is expanded into, keyed by logical ID the way a function
 * is.
 */
export type SamFunctionEventExpansion = (
  event: SamFunctionEvent,
) => Record<string, SimCfnTemplateValue>;

/**
 * The SAM event types this expansion covers, by the name an event writes under
 * `Type`.
 *
 * This table is the list of supported event types, the way the intrinsic
 * function parsers are a table of the supported functions. An event of a type
 * absent from it expands into nothing and leaves the function as it is. The
 * template deploys a function nothing calls, and the deployment stands.
 */
const eventExpansions: ReadonlyMap<string, SamFunctionEventExpansion> = new Map(
  [
    ["EventBridgeRule", samEventBridgeRuleEventResources],
    ["HttpApi", samHttpApiEventResources],
    ["Schedule", samScheduleEventResources],
    ["ScheduleV2", samScheduleV2EventResources],
  ],
);

/**
 * The Resources the `Events` of a SAM function are expanded into.
 *
 * Every event is expanded on its own and the results are merged, so two events
 * naming the same shared Resource converge on one entry. That is what gives
 * every event naming no `ApiId` the same implicit API, whether the events are
 * on one function or spread over several.
 */
export function samFunctionEventResources(
  properties: SamFunctionEventsProperties,
): Record<string, SimCfnTemplateValue> {
  const events = properties.functionProperties["Events"];

  if (!isSamTemplateRecord(events)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(events).flatMap(([eventName, event]) =>
      Object.entries(expandedEvent(properties, eventName, event)),
    ),
  );
}

/**
 * The Resources one event is expanded into.
 */
function expandedEvent(
  properties: SamFunctionEventsProperties,
  eventName: string,
  event: SimCfnTemplateValue,
): Record<string, SimCfnTemplateValue> {
  if (!isSamTemplateRecord(event)) {
    return {};
  }

  const eventType = event["Type"];
  const expansion =
    typeof eventType === "string" ? eventExpansions.get(eventType) : undefined;

  if (expansion === undefined) {
    return {};
  }

  const eventProperties = event["Properties"];

  return expansion({
    functionLogicalId: properties.logicalId,
    eventName,
    properties: isSamTemplateRecord(eventProperties) ? eventProperties : {},
    condition: samConditionAttribute(properties.condition),
  });
}
