import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import { samValueList } from "../../sim-cfn-sam-record.js";
import type { SamFunctionEvent } from "./sim-cfn-sam-declared-event.js";
import type { SamResourceEdit } from "./sim-cfn-sam-resource-edit.js";
import { samS3NotifiedBucket } from "./sim-cfn-sam-s3-notified-bucket.js";

/**
 * What an `S3` event puts on the Bucket and what it needs beside it.
 */
interface SamS3EventNotification {
  /** The logical ID of the Bucket the event names. */
  readonly bucketLogicalId: string;
  /** One `LambdaConfigurations` entry for each event name stated. */
  readonly configurations: readonly SimCfnTemplateValueRecord[];
}

/**
 * The Resource an `S3` event expands into, which is the permission S3 invokes
 * the function under.
 *
 * S3 checks the function's resource policy as the notification is applied and
 * again on every event, so the Bucket's own Resource is not enough on its own.
 *
 * The grant names the Account rather than the Bucket. A Bucket ARN would have
 * to come from `Fn::GetAtt` on the Bucket, and the Bucket already names the
 * function, which is the circular dependency CloudFormation refuses.
 */
export function samS3EventResources(
  event: SamFunctionEvent,
): Record<string, SimCfnTemplateValue> {
  if (samS3EventNotification(event) === undefined) {
    return {};
  }

  return {
    [permissionLogicalId(event)]: {
      Type: "AWS::Lambda::Permission",
      ...event.condition,
      Properties: {
        Action: "lambda:InvokeFunction",
        FunctionName: { "Fn::GetAtt": [event.functionLogicalId, "Arn"] },
        Principal: "s3.amazonaws.com",
        SourceAccount: { Ref: "AWS::AccountId" },
      },
    },
  };
}

/**
 * The change an `S3` event makes to the Bucket the template already declares.
 *
 * An S3 notification is a property of the Bucket, so this is the one event type
 * with no Resource of its own to be. The event adds its own
 * `LambdaConfigurations` entries and leaves whatever the Bucket already
 * carried, so a template configuring notifications by hand keeps them and two
 * events on one Bucket both arrive.
 *
 * The Bucket is made to depend on the permission, because S3 refuses a
 * destination it may not invoke and nothing else orders the two.
 *
 * The notification is unconditional even where the function is conditioned. A
 * `Condition` covers a whole Resource, and there is no conditioning a fragment
 * of somebody else's property.
 */
export function samS3EventEdits(
  event: SamFunctionEvent,
): readonly SamResourceEdit[] {
  const notification = samS3EventNotification(event);

  if (notification === undefined) {
    return [];
  }

  return [
    {
      logicalId: notification.bucketLogicalId,
      edit: (resource) =>
        samS3NotifiedBucket(resource, {
          bucketLogicalId: notification.bucketLogicalId,
          configurations: notification.configurations,
          permissionLogicalId: permissionLogicalId(event),
        }),
    },
  ];
}

/**
 * What the event asks of the Bucket, or nothing where it named no Bucket or no
 * event to be told about.
 *
 * Either one missing leaves the function as it is rather than failing the
 * deployment, the same answer an event of a type nothing expands gets.
 */
function samS3EventNotification(
  event: SamFunctionEvent,
): SamS3EventNotification | undefined {
  const bucket = event.properties["Bucket"];
  const configurations = lambdaConfigurations(event);

  if (typeof bucket !== "string" || configurations.length === 0) {
    return undefined;
  }

  return { bucketLogicalId: bucket, configurations };
}

/**
 * The `LambdaConfigurations` entries the event's `Events` name.
 *
 * `Events` holds one event name or a list of them, where a CloudFormation
 * configuration carries exactly one, so a list of three is three
 * configurations pointing at the same function. The `Filter` an event states is
 * already written the way a Bucket writes one, and goes on each of them.
 */
function lambdaConfigurations(
  event: SamFunctionEvent,
): readonly SimCfnTemplateValueRecord[] {
  const filter = event.properties["Filter"];

  return eventNames(event.properties["Events"]).map((name) => ({
    Event: name,
    ...(filter !== undefined && { Filter: filter }),
    Function: { "Fn::GetAtt": [event.functionLogicalId, "Arn"] },
  }));
}

function eventNames(events: SimCfnTemplateValue | undefined): string[] {
  if (typeof events === "string") {
    return [events];
  }

  return samValueList(events).filter((name) => typeof name === "string");
}

function permissionLogicalId(event: SamFunctionEvent): string {
  return `${event.functionLogicalId}${event.eventName}S3Permission`;
}
