import { firehoseDeliveryStreamResourceType } from "../../../../firehose/cfn/sim-cfn-firehose-resource-types.js";
import { SimFirehoseDeliveryStream } from "../../../../firehose/stream/sim-firehose-delivery-stream.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimFirehoseDeliveryStreamCfn } from "./sim-firehose-delivery-stream-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated Firehose Resource.
 */
export function firehoseValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  const { type, simResource } = properties;

  if (
    type === firehoseDeliveryStreamResourceType &&
    simResource instanceof SimFirehoseDeliveryStream
  ) {
    return new SimFirehoseDeliveryStreamCfn(simResource);
  }

  return undefined;
}
