/**
 * The sim Firehose Command types, gathered for the service facade.
 */
export type {
  SimCreateDeliveryStreamCommand,
  SimCreateDeliveryStreamCommandInput,
  SimCreateDeliveryStreamCommandOutput,
  SimDeleteDeliveryStreamCommand,
  SimDeleteDeliveryStreamCommandInput,
  SimDeleteDeliveryStreamCommandOutput,
  SimDescribeDeliveryStreamCommand,
  SimDescribeDeliveryStreamCommandInput,
  SimDescribeDeliveryStreamCommandOutput,
  SimFirehoseBufferingHintsOutput,
  SimFirehoseDeliveryStreamDescription,
  SimFirehoseDestinationDescription,
  SimFirehoseExtendedS3DestinationDescription,
  SimFirehoseTag,
  SimListDeliveryStreamsCommand,
  SimListDeliveryStreamsCommandInput,
  SimListDeliveryStreamsCommandOutput,
} from "./stream/stream.command.js";
export type {
  SimFirehosePutRecordBatchResponseEntry,
  SimFirehoseRecordInput,
  SimPutRecordBatchCommand,
  SimPutRecordBatchCommandInput,
  SimPutRecordBatchCommandOutput,
  SimPutRecordCommand,
  SimPutRecordCommandInput,
  SimPutRecordCommandOutput,
} from "./record/record.command.js";
