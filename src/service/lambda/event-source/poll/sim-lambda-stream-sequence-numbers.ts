/**
 * The sequence numbers a batch's records can be named by, in stream order.
 *
 * A batch item failure names a record by its sequence number, on Kinesis the
 * same way as on DynamoDB Streams, rather than by the `eventID` a DynamoDB
 * event carries. Both pollers read the same list out of whatever their own
 * records call the field. A record without a sequence number cannot be named,
 * and it is left out rather than reported as an empty name.
 */
export function simLambdaStreamSequenceNumbers(
  values: readonly (string | undefined)[],
): readonly string[] {
  return values.flatMap((value) =>
    value === undefined || value === "" ? [] : [value],
  );
}
