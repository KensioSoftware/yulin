import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import { samRecordWithout } from "../../sim-cfn-sam-record.js";
import type { SamFunctionEvent } from "./sim-cfn-sam-declared-event.js";
import type { SamEventSourceKind } from "./sim-cfn-sam-event-source-kind.js";
import {
  samDynamoDbEventSource,
  samSqsEventSource,
} from "./sim-cfn-sam-event-source-kind.js";

/**
 * Expand one `SQS` event into the mapping that polls the queue for the
 * function.
 *
 * The queue is named as an ARN, so an event naming one the template declares
 * writes `Fn::GetAtt` and one naming a queue from elsewhere writes a literal.
 * Either way the queue itself is somebody else's Resource.
 */
export function samSqsEventResources(
  event: SamFunctionEvent,
): Record<string, SimCfnTemplateValue> {
  return mappingResources(event, samSqsEventSource);
}

/**
 * Expand one `DynamoDB` event into the mapping that reads the table's stream
 * for the function.
 *
 * `Stream` is the stream's ARN rather than the table's, which is what
 * `Fn::GetAtt` on a table's `StreamArn` answers with.
 */
export function samDynamoDbEventResources(
  event: SamFunctionEvent,
): Record<string, SimCfnTemplateValue> {
  return mappingResources(event, samDynamoDbEventSource);
}

/**
 * The AWS::Lambda::EventSourceMapping an event polling a source expands into.
 *
 * Everything the event states beside the source goes onto the mapping under
 * the name it already carries, so `BatchSize`, `StartingPosition`, `Enabled`
 * and `FilterCriteria` arrive without being listed here. A property the
 * mapping has no meaning for is refused by the mapping, which names it, rather
 * than dropped on the way.
 *
 * An event naming no source expands into nothing. There is no mapping to make
 * without one, and a mapping polling nothing would fail the whole deployment
 * where the function on its own still stands.
 */
function mappingResources(
  event: SamFunctionEvent,
  kind: SamEventSourceKind,
): Record<string, SimCfnTemplateValue> {
  const source = event.properties[kind.sourceProperty];

  if (source === undefined) {
    return {};
  }

  return {
    [`${event.functionLogicalId}${event.eventName}EventSourceMapping`]: {
      Type: "AWS::Lambda::EventSourceMapping",
      ...event.condition,
      Properties: {
        ...samRecordWithout(event.properties, kind.sourceProperty),
        EventSourceArn: source,
        // `Ref` on a function answers its name, which is what a mapping names
        // its function by.
        FunctionName: { Ref: event.functionLogicalId },
      },
    },
  };
}
