import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimFirehoseKinesisSourceInput } from "../../source/sim-firehose-source-choice.js";
import {
  simCfnFirehoseDeliveryStreamPropertyError,
  simCfnFirehoseUnsupportedResourceError,
} from "../sim-cfn-firehose-resource-error.js";
import {
  kinesisStreamSourcePropertyName,
  readSourcePropertyNames,
  sourcePropertySuffix,
} from "./sim-cfn-firehose-delivery-stream-property-names.js";

/**
 * The source configuration a delivery stream Resource reads from.
 *
 * A source property outside the simulation skips the Resource, naming the
 * property the template wrote. A delivery stream reading from MSK or from a
 * database would take nothing and deliver nothing, and `DeliveryStreamType` is
 * no help in finding it. The property is what says where the records come from,
 * and a template that leaves the type out gets `DirectPut` by default, on real
 * CloudFormation as well as here.
 *
 * What the Kinesis configuration may say is decided by simulated Firehose, at
 * the command that reads it. A stream in another account or region and a
 * missing `RoleARN` are both refused there.
 */
export function simCfnFirehoseSource(
  resource: SimCfnResource,
  properties: ReadonlyMap<string, SimCfnTemplateValue>,
): SimFirehoseKinesisSourceInput | undefined {
  const unsimulated = properties
    .keys()
    .find(
      (name) =>
        name.endsWith(sourcePropertySuffix) &&
        !readSourcePropertyNames.has(name),
    );

  if (unsimulated !== undefined) {
    throw simCfnFirehoseUnsupportedResourceError(
      resource.logicalId,
      `simulated Firehose takes records through PutRecord and PutRecordBatch, ` +
        `or reads them off a simulated Kinesis stream, and this delivery ` +
        `stream declares ${unsimulated}`,
    );
  }

  const source = properties.get(kinesisStreamSourcePropertyName);

  if (source === undefined) {
    return undefined;
  }

  if (!isRecord(source)) {
    throw error(
      resource,
      `${kinesisStreamSourcePropertyName} must be an object`,
    );
  }

  const streamArn = source["KinesisStreamARN"];
  const roleArn = source["RoleARN"];

  return {
    ...(streamArn !== undefined && {
      KinesisStreamARN: sourceString(resource, streamArn, "KinesisStreamARN"),
    }),
    ...(roleArn !== undefined && {
      RoleARN: sourceString(resource, roleArn, "RoleARN"),
    }),
  };
}

/**
 * A source field that has to be a string.
 */
function sourceString(
  resource: SimCfnResource,
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string") {
    throw error(
      resource,
      `${kinesisStreamSourcePropertyName}.${field} must be a string`,
    );
  }

  return value;
}

function error(resource: SimCfnResource, reason: string): Error {
  return simCfnFirehoseDeliveryStreamPropertyError(resource.logicalId, reason);
}
