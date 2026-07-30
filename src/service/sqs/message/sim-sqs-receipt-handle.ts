import { randomBytes } from "node:crypto";

const handleBytes = 72;

/**
 * Issue a receipt handle for one receive of one message.
 *
 * Real receipt handles are long opaque strings, and a fresh one is issued every
 * time a message is handed out. Generating something equally opaque here means
 * nothing can quietly depend on a handle's shape, or on it being the message id,
 * the way a consumer written against a simpler fake might.
 */
export function makeSimSqsReceiptHandle(): string {
  return randomBytes(handleBytes).toString("base64");
}
