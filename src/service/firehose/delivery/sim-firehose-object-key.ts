import { randomUUID } from "node:crypto";

/**
 * What one delivered Object's key is built from.
 */
export interface SimFirehoseObjectKeyParts {
  readonly prefix: string;
  readonly deliveryStreamName: string;
  readonly versionId: string;
  readonly deliveredAt: Date;
}

/**
 * The key Firehose writes one buffer under.
 *
 * Real Firehose builds it as `<Prefix>YYYY/MM/DD/HH/` followed by the delivery
 * stream name, its version, the delivery time and a random string. The date
 * path is UTC, and it is what makes listing one hour of a Bucket cheap.
 *
 * A delivery stream with no `Prefix` gets the bare date path, the default real
 * Firehose applies.
 */
export function simFirehoseObjectKey(parts: SimFirehoseObjectKeyParts): string {
  const { prefix, deliveryStreamName, versionId, deliveredAt } = parts;
  const year = String(deliveredAt.getUTCFullYear());
  const month = padded(deliveredAt.getUTCMonth() + 1);
  const day = padded(deliveredAt.getUTCDate());
  const hour = padded(deliveredAt.getUTCHours());
  const minute = padded(deliveredAt.getUTCMinutes());
  const second = padded(deliveredAt.getUTCSeconds());
  const stamp = `${year}-${month}-${day}-${hour}-${minute}-${second}`;

  return (
    `${prefix}${year}/${month}/${day}/${hour}/` +
    `${deliveryStreamName}-${versionId}-${stamp}-${randomUUID()}`
  );
}

function padded(value: number): string {
  return String(value).padStart(2, "0");
}
