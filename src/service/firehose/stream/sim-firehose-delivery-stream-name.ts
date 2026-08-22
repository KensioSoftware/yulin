import { SimFirehoseInvalidArgumentException } from "../error/sim-firehose.error.js";

const maxNameLength = 64;

const namePattern = /^[\w.-]+$/;

/**
 * Check a delivery stream name the way real Firehose does, or refuse it.
 *
 * The name is the whole of a delivery stream's identity in one Account and
 * Region, and it is the resource part of the ARN. Firehose accepts letters,
 * digits, underscores, hyphens and dots, up to 64 characters.
 */
export function requireSimFirehoseDeliveryStreamName(
  name: string | undefined,
): string {
  if (name === undefined || name === "") {
    throw new SimFirehoseInvalidArgumentException(
      "DeliveryStreamName is required",
    );
  }

  if (name.length > maxNameLength) {
    throw new SimFirehoseInvalidArgumentException(
      `DeliveryStreamName ${name} is longer than the ${maxNameLength} ` +
        `characters Firehose allows`,
    );
  }

  if (!namePattern.test(name)) {
    throw new SimFirehoseInvalidArgumentException(
      `DeliveryStreamName ${name} may hold only letters, digits, underscores, ` +
        `hyphens and dots`,
    );
  }

  return name;
}
