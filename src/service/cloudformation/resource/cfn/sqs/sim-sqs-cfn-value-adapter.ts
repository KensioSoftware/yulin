import { SimSqsQueue } from "../../../../sqs/queue/sim-sqs-queue.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimSqsQueueCfn } from "./sim-sqs-queue-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated SQS Resource.
 */
export function sqsValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::SQS::Queue" &&
    properties.simResource instanceof SimSqsQueue
  ) {
    return new SimSqsQueueCfn({ queue: properties.simResource });
  }

  return undefined;
}
