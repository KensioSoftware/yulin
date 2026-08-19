import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import { samRecordAt, samValueList } from "../../sim-cfn-sam-record.js";
import type { SamFunctionEvent } from "./sim-cfn-sam-declared-event.js";
import type { SamEventSourceKind } from "./sim-cfn-sam-event-source-kind.js";
import {
  samDynamoDbEventSource,
  samSqsEventSource,
} from "./sim-cfn-sam-event-source-kind.js";
import type { SamResourceEdit } from "./sim-cfn-sam-resource-edit.js";

/**
 * What an `SQS` event adds to the function's generated execution Role.
 */
export function samSqsEventEdits(
  event: SamFunctionEvent,
): readonly SamResourceEdit[] {
  return pollingRoleEdits(event, samSqsEventSource);
}

/**
 * What a `DynamoDB` event adds to the function's generated execution Role.
 */
export function samDynamoDbEventEdits(
  event: SamFunctionEvent,
): readonly SamResourceEdit[] {
  return pollingRoleEdits(event, samDynamoDbEventSource);
}

/**
 * The permission to poll, added to the execution Role the function was
 * expanded with.
 *
 * Lambda refuses to create a mapping whose Role cannot poll the source, so the
 * grant is part of expanding the event rather than something the template is
 * left to write. SAM does the same thing by attaching a managed policy of its
 * own.
 *
 * A function running as a Role it named itself was expanded with no Role, and
 * this edit finds nothing to change. A Role the template declared says what
 * the function may do, and SAM leaves that one alone too.
 */
function pollingRoleEdits(
  event: SamFunctionEvent,
  kind: SamEventSourceKind,
): readonly SamResourceEdit[] {
  const source = event.properties[kind.sourceProperty];

  if (source === undefined) {
    return [];
  }

  const policy = {
    PolicyName: `${event.functionLogicalId}${event.eventName}PollerPolicy`,
    PolicyDocument: {
      Version: "2012-10-17",
      Statement: [...kind.pollingStatements(source)],
    },
  };

  return [
    {
      logicalId: `${event.functionLogicalId}Role`,
      edit: (resource) => roleWithPolicy(resource, policy),
    },
  ];
}

function roleWithPolicy(
  resource: SimCfnTemplateValueRecord,
  policy: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const properties = samRecordAt(resource, "Properties");

  return {
    ...resource,
    Properties: {
      ...properties,
      Policies: [...samValueList(properties["Policies"]), policy],
    },
  };
}
