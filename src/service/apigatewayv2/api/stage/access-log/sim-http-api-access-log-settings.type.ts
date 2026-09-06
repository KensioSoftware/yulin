/**
 * The `AccessLogSettings` a stage is created with.
 *
 * `DestinationArn` names a CloudWatch Logs log group. HTTP APIs accept no
 * other destination, and a Kinesis Data Firehose delivery stream is a REST API
 * option that this shape leaves out.
 *
 * `Format` is the line written per request, with `$context` variables
 * substituted from the request that produced it.
 */
export interface SimHttpApiAccessLogSettingsInput {
  readonly DestinationArn?: string | undefined;
  readonly Format?: string | undefined;
}

/**
 * What a stage reports of the access log settings it was created with.
 */
export interface SimHttpApiAccessLogSettingsView {
  DestinationArn: string;
  Format: string;
}
