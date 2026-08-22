export { SimFirehose } from "./sim-firehose.js";
export type { SimFirehoseRequestOptions } from "./command/sim-firehose-request-options.js";
export type * from "./command/sim-firehose-command.types.js";
export { SimFirehoseDeliveryStream } from "./stream/sim-firehose-delivery-stream.js";
export type {
  SimFirehoseDeliveryStreamStatus,
  SimFirehoseDeliveryStreamType,
} from "./stream/sim-firehose-delivery-stream.js";
export { simFirehoseDeliveryStreamArn } from "./stream/sim-firehose-delivery-stream-arn.js";
export { SimFirehoseBufferingHints } from "./destination/sim-firehose-buffering-hints.js";
export { SimFirehoseS3Destination } from "./destination/sim-firehose-s3-destination.js";
export { SimFirehoseDeliveryFailure } from "./delivery/sim-firehose-delivery-failures.js";
export {
  SimFirehoseError,
  SimFirehoseInvalidArgumentException,
  SimFirehoseResourceInUseException,
  SimFirehoseResourceNotFoundException,
  SimFirehoseUnsimulatedDestination,
  SimFirehoseUnsimulatedSource,
} from "./error/sim-firehose.error.js";
