/**
 * The AWS::KinesisFirehose::DeliveryStream properties this simulation acts on.
 */
export const deliveryStreamNamePropertyName = "DeliveryStreamName";

export const deliveryStreamTypePropertyName = "DeliveryStreamType";

export const kinesisStreamSourcePropertyName =
  "KinesisStreamSourceConfiguration";

export const directPutSourcePropertyName = "DirectPutSourceConfiguration";

export const extendedS3DestinationPropertyName =
  "ExtendedS3DestinationConfiguration";

export const s3DestinationPropertyName = "S3DestinationConfiguration";

export const tagsPropertyName = "Tags";

/**
 * The suffix every Firehose destination configuration property ends in.
 */
export const destinationPropertySuffix = "DestinationConfiguration";

/**
 * The suffix every Firehose source configuration property ends in.
 */
export const sourcePropertySuffix = "SourceConfiguration";

/**
 * The two source properties this simulation has an answer for.
 *
 * `KinesisStreamSourceConfiguration` goes through to CreateDeliveryStream, and
 * `DirectPutSourceConfiguration` is a throughput hint on a delivery stream that
 * is already taking direct puts. Everything else ending in
 * {@link sourcePropertySuffix} reads from somewhere outside the simulation,
 * found by the suffix so a source AWS adds later needs no change here.
 */
export const readSourcePropertyNames: ReadonlySet<string> = new Set([
  kinesisStreamSourcePropertyName,
  directPutSourcePropertyName,
]);

/**
 * The two destination properties this simulation delivers to. Everything else
 * ending in {@link destinationPropertySuffix} is a destination outside the
 * simulation, found by the suffix so one AWS adds later needs no change here.
 */
export const simulatedDestinationPropertyNames: ReadonlySet<string> = new Set([
  extendedS3DestinationPropertyName,
  s3DestinationPropertyName,
]);

/**
 * Real AWS::KinesisFirehose::DeliveryStream properties this simulation does not
 * model, and why.
 *
 * Each is recorded against the Resource rather than refused, so a template
 * carrying one still deploys a delivery stream and the omission is somewhere a
 * test can find it.
 */
export const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map([
  [
    "DeliveryStreamEncryptionConfigurationInput",
    "server-side encryption is not simulated, and every delivered Object " +
      "holds the bytes that were put",
  ],
  [
    directPutSourcePropertyName,
    "throughput is unlimited in the simulation, so a throughput hint has " +
      "nothing to act on",
  ],
]);

/**
 * S3 destination properties this simulation does not model, and why.
 *
 * The path recorded against the Resource is the destination property these sit
 * under, then the name, so a reader can find the one the template wrote.
 */
export const unsimulatedDestinationPropertyReasons: ReadonlyMap<
  string,
  string
> = new Map([
  [
    "ProcessingConfiguration",
    "record transformation through a Lambda is not simulated, and records " +
      "are delivered as they were put",
  ],
  [
    "DynamicPartitioningConfiguration",
    "dynamic partitioning reads record content, and a record's bytes are " +
      "carried here without being read",
  ],
  [
    "DataFormatConversionConfiguration",
    "Parquet and ORC conversion is not simulated, and every delivered " +
      "Object holds the bytes that were put",
  ],
  [
    "CompressionFormat",
    "compression is not simulated, and every destination reports " +
      "UNCOMPRESSED",
  ],
  [
    "EncryptionConfiguration",
    "Objects are delivered unencrypted, and no key is ever asked for",
  ],
  [
    "CloudWatchLoggingOptions",
    "delivery is not logged to CloudWatch Logs, and a failed delivery is " +
      "read back through getDeliveryFailures()",
  ],
  ["RetryOptions", "a failed delivery is recorded once rather than retried"],
  ["S3BackupMode", "the source record backup destination is not simulated"],
  [
    "S3BackupConfiguration",
    "the source record backup destination is not simulated",
  ],
  [
    "FileExtension",
    "the Object key is built the way real Firehose builds it, with no " +
      "extension on the end",
  ],
  [
    "CustomTimeZone",
    "the date path in an Object key is UTC, as it is on real Firehose by " +
      "default",
  ],
]);
