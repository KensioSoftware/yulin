import { crc32 } from "../../util/zip/crc32.js";
import { simSdkWireJsonBody } from "./sim-sdk-wire-json.js";

/**
 * The media type of an AWS event stream response body.
 */
export const simSdkWireEventStreamContentType =
  "application/vnd.amazon.eventstream";

/**
 * The header value type code for a string, the only type written here.
 */
const stringHeaderType = 7;

/**
 * The bytes of the prelude: the total length, the headers length and the
 * prelude checksum, each four bytes.
 */
const preludeLength = 12;

/**
 * The bytes of the checksum closing every message.
 */
const messageChecksumLength = 4;

/**
 * Encode an event stream as the `application/vnd.amazon.eventstream` body an
 * SDK reads it from.
 *
 * Each event is a union with one member set, as an SDK hands it to calling
 * code (`{ chunk: { bytes } }` or `{ contentBlockDelta: { ... } }`). The
 * member name is the message's event type, and its value is the JSON payload.
 *
 * The whole stream is read before the body is built. A simulated stream has
 * every event available at once, so sending them together loses nothing.
 */
export async function simSdkWireEventStreamBody(
  events: AsyncIterable<object>,
): Promise<Uint8Array> {
  const messages: Uint8Array[] = [];

  for await (const event of events) {
    const members = Object.entries(event).filter(
      ([, value]) => value !== undefined,
    );
    for (const [eventType, value] of members) {
      messages.push(eventMessage(eventType, simSdkWireJsonBody(value)));
    }
  }

  return Buffer.concat(messages);
}

/**
 * Encode one event message.
 *
 * The layout is the prelude, the headers, the payload and a CRC-32 of
 * everything before it. The prelude ends with a CRC-32 of its first eight
 * bytes.
 */
function eventMessage(eventType: string, payload: Uint8Array): Uint8Array {
  const headers = Buffer.concat([
    stringHeader(":event-type", eventType),
    stringHeader(":content-type", "application/json"),
    stringHeader(":message-type", "event"),
  ]);
  const totalLength =
    preludeLength + headers.length + payload.length + messageChecksumLength;
  const checksumOffset = totalLength - messageChecksumLength;

  const message = Buffer.alloc(totalLength);
  message.writeUInt32BE(totalLength, 0);
  message.writeUInt32BE(headers.length, 4);
  message.writeUInt32BE(crc32(message.subarray(0, 8)), 8);
  headers.copy(message, preludeLength);
  message.set(payload, preludeLength + headers.length);
  message.writeUInt32BE(
    crc32(message.subarray(0, checksumOffset)),
    checksumOffset,
  );

  return message;
}

/**
 * Encode one string-valued header: the name length and name, the type code,
 * and the value length and value.
 */
function stringHeader(name: string, value: string): Buffer {
  const nameBytes = Buffer.from(name);
  const valueBytes = Buffer.from(value);
  const header = Buffer.alloc(4 + nameBytes.length + valueBytes.length);

  header.writeUInt8(nameBytes.length, 0);
  nameBytes.copy(header, 1);
  header.writeUInt8(stringHeaderType, 1 + nameBytes.length);
  header.writeUInt16BE(valueBytes.length, 2 + nameBytes.length);
  valueBytes.copy(header, 4 + nameBytes.length);

  return header;
}
