import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type {
  SamFunctionEvent,
  SamFunctionEventsProperties,
} from "./sim-cfn-sam-declared-event.js";
import { samDeclaredEvents } from "./sim-cfn-sam-declared-event.js";
import {
  samDynamoDbEventResources,
  samSqsEventResources,
} from "./sim-cfn-sam-event-source-mapping-event.js";
import {
  samDynamoDbEventEdits,
  samSqsEventEdits,
} from "./sim-cfn-sam-event-source-role.js";
import { samApiEventResources } from "./sim-cfn-sam-api-event.js";
import { samEventBridgeRuleEventResources } from "./sim-cfn-sam-event-bridge-rule-event.js";
import { samHttpApiEventResources } from "./sim-cfn-sam-http-api-event.js";
import type { SamResourceEdit } from "./sim-cfn-sam-resource-edit.js";
import {
  samS3EventEdits,
  samS3EventResources,
} from "./sim-cfn-sam-s3-event.js";
import { samScheduleEventResources } from "./sim-cfn-sam-schedule-event.js";
import { samScheduleV2EventResources } from "./sim-cfn-sam-schedule-v2-event.js";
import { samSnsEventResources } from "./sim-cfn-sam-sns-event.js";

export type { SamFunctionEvent } from "./sim-cfn-sam-declared-event.js";

/**
 * What one event type is expanded into, keyed by logical ID the way a function
 * is.
 */
export type SamFunctionEventExpansion = (
  event: SamFunctionEvent,
) => Record<string, SimCfnTemplateValue>;

/**
 * What one event type changes about Resources it did not make.
 */
export type SamFunctionEventEdit = (
  event: SamFunctionEvent,
) => readonly SamResourceEdit[];

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
    ["Api", samApiEventResources],
    ["DynamoDB", samDynamoDbEventResources],
    ["EventBridgeRule", samEventBridgeRuleEventResources],
    ["HttpApi", samHttpApiEventResources],
    ["S3", samS3EventResources],
    ["SNS", samSnsEventResources],
    ["SQS", samSqsEventResources],
    ["Schedule", samScheduleEventResources],
    ["ScheduleV2", samScheduleV2EventResources],
  ],
);

/**
 * What one event type changes about Resources it did not make, by the name the
 * event writes under `Type`.
 *
 * This is the second half of the same table, for what an event cannot express
 * as a Resource of its own. An `S3` event notifies a Bucket the template
 * declares, and a polled event grants the function's own execution Role the
 * permission to poll. Keying either by the logical ID it changes would deploy
 * the change in place of the Resource, since expanded Resources are merged
 * last write wins.
 *
 * An event type belongs in both tables where it does both, as all three of
 * these do.
 */
const eventEdits: ReadonlyMap<string, SamFunctionEventEdit> = new Map([
  ["DynamoDB", samDynamoDbEventEdits],
  ["S3", samS3EventEdits],
  ["SQS", samSqsEventEdits],
]);

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
  return Object.fromEntries(
    samDeclaredEvents(properties).flatMap((declared) =>
      Object.entries(
        eventExpansions.get(declared.type)?.(declared.event) ?? {},
      ),
    ),
  );
}

/**
 * The changes the `Events` of a SAM function make to Resources the template
 * already declares.
 *
 * They are collected rather than applied here, because the Resources they name
 * are the template's own and are nowhere near the function. They are applied
 * once every SAM Resource in the template has been expanded.
 */
export function samFunctionEventEdits(
  properties: SamFunctionEventsProperties,
): readonly SamResourceEdit[] {
  return samDeclaredEvents(properties).flatMap(
    (declared) => eventEdits.get(declared.type)?.(declared.event) ?? [],
  );
}
