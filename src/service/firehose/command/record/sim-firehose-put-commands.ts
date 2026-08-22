import { randomUUID } from "node:crypto";
import type { SimFirehoseDelivery } from "../../delivery/sim-firehose-delivery.js";
import type { SimFirehoseDeliveryStreamAccess } from "../sim-firehose-delivery-stream-access.js";
import type { SimFirehoseRequestOptions } from "../sim-firehose-request-options.js";
import {
  simFirehoseBatchData,
  simFirehoseRecordData,
} from "./sim-firehose-record-data.js";
import type {
  SimFirehosePutRecordBatchResponseEntry,
  SimPutRecordBatchCommand,
  SimPutRecordBatchCommandOutput,
  SimPutRecordCommand,
  SimPutRecordCommandOutput,
} from "./record.command.js";

interface SimFirehosePutCommandsProperties {
  readonly access: SimFirehoseDeliveryStreamAccess;
  readonly delivery: SimFirehoseDelivery;
}

/**
 * The commands that put records onto a delivery stream.
 *
 * A record is taken onto the delivery stream's buffer and the request is
 * answered. The Object it will land in is written later, when the buffer passes
 * one of its two bounds.
 *
 * `Encrypted` is always false. Server side encryption changes nothing a test
 * can see, so `DeliveryStreamEncryptionConfigurationInput` is left unsimulated
 * and no delivery stream reports itself encrypted.
 */
export class SimFirehosePutCommands {
  private readonly access: SimFirehoseDeliveryStreamAccess;
  private readonly delivery: SimFirehoseDelivery;

  constructor(properties: SimFirehosePutCommandsProperties) {
    this.access = properties.access;
    this.delivery = properties.delivery;
  }

  /**
   * Put one record onto a delivery stream.
   */
  putRecord(
    command: SimPutRecordCommand,
    options?: SimFirehoseRequestOptions,
  ): SimPutRecordCommandOutput {
    const deliveryStream = this.access.require(
      "firehose:PutRecord",
      command.input.DeliveryStreamName,
      options,
    );

    this.delivery.accept(
      deliveryStream,
      simFirehoseRecordData(command.input.Record),
    );

    return { $metadata: {}, RecordId: randomUUID(), Encrypted: false };
  }

  /**
   * Put a batch of records onto a delivery stream.
   *
   * Every record in a batch this simulation accepted is taken. Real Firehose
   * can fail some of a batch under throttling, and nothing here throttles, so
   * `FailedPutCount` is always zero and every response entry carries a record
   * id.
   */
  putRecordBatch(
    command: SimPutRecordBatchCommand,
    options?: SimFirehoseRequestOptions,
  ): SimPutRecordBatchCommandOutput {
    const deliveryStream = this.access.require(
      "firehose:PutRecordBatch",
      command.input.DeliveryStreamName,
      options,
    );
    const data = simFirehoseBatchData(command.input.Records);
    const responses: SimFirehosePutRecordBatchResponseEntry[] = [];

    for (const record of data) {
      this.delivery.accept(deliveryStream, record);
      responses.push({ RecordId: randomUUID() });
    }

    return {
      $metadata: {},
      FailedPutCount: 0,
      Encrypted: false,
      RequestResponses: responses,
    };
  }
}
