import type { SimArn } from "../../aws/arn.js";

/**
 * The instant a stream being enabled now takes its label from.
 *
 * A label is the instant the stream was enabled, and two streams on one table
 * cannot share one: the label is what tells them apart in the ARN. Simulated
 * time can stand still, so a stream enabled at an instant a previous one
 * already took is moved on by a millisecond rather than colliding with it.
 */
export function simDynamoDbStreamLabelInstant(
  now: Date,
  previous: Date | undefined,
): Date {
  if (previous === undefined || now.getTime() > previous.getTime()) {
    return now;
  }

  return new Date(previous.getTime() + 1);
}

/**
 * The label a stream enabled at an instant carries.
 *
 * DynamoDB labels a stream with the instant it was enabled, to the
 * millisecond and without the trailing zone marker: `2026-08-04T09:00:00.000`.
 */
export function simDynamoDbStreamLabel(at: Date): string {
  return at.toISOString().replace("Z", "");
}

/**
 * The ARN a table's stream has, which is the table's own ARN and the label.
 */
export function simDynamoDbStreamArn(tableArn: SimArn, label: string): SimArn {
  return `${tableArn}/stream/${label}`;
}
