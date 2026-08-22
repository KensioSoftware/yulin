import { kinesisStreamResourceType } from "../../../../kinesis/cfn/sim-cfn-kinesis-resource-types.js";
import { SimKinesisStream } from "../../../../kinesis/stream/sim-kinesis-stream.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimKinesisStreamCfn } from "./sim-kinesis-stream-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated Kinesis Resource.
 */
export function kinesisValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  const { type, simResource } = properties;

  if (
    type === kinesisStreamResourceType &&
    simResource instanceof SimKinesisStream
  ) {
    return new SimKinesisStreamCfn(simResource);
  }

  return undefined;
}
