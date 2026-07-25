import { DnsMessageFormatError } from "../error/dns-message.error.js";

const maxLabelLength = 63;
const maxNameLength = 255;
// A length byte with its top two bits set introduces a compression pointer
// rather than a literal label.
const compressionPointerMask = 0xc0;

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

/**
 * Encode a DNS name as length-prefixed labels followed by a root label.
 *
 * Names are always written uncompressed. Compression is optional for a message
 * author and every resolver must accept uncompressed names, so leaving it out
 * removes the most error-prone part of the wire format at the cost of a few
 * bytes per answer.
 */
export function encodeDnsName(name: string): Uint8Array {
  const bytes: number[] = [];

  for (const label of splitDnsLabels(name)) {
    const labelBytes = encodeLabel(name, label);
    bytes.push(labelBytes.length, ...labelBytes);
  }

  // The root label terminates every encoded name.
  bytes.push(0);

  if (bytes.length > maxNameLength) {
    throw new DnsMessageFormatError(
      `DNS name ${name} encodes to ${String(bytes.length)} bytes, over the ${String(maxNameLength)} byte limit`,
    );
  }

  return Uint8Array.from(bytes);
}

interface DecodedDnsName {
  readonly name: string;
  readonly nextOffset: number;
}

/**
 * Decode a DNS name starting at an offset, returning it without a trailing dot.
 *
 * Compression pointers are rejected rather than followed. The only names the
 * simulator decodes are question names, which sit at the start of a message
 * with nothing before them to point back at, so a pointer here means the
 * message is malformed or is using a feature the simulator does not model.
 */
export function decodeDnsName(
  message: Uint8Array,
  offset: number,
): DecodedDnsName {
  const labels: string[] = [];
  let cursor = offset;

  for (;;) {
    const length = byteAt(message, cursor);

    if (length === 0) {
      return { name: labels.join("."), nextOffset: cursor + 1 };
    }

    if ((length & compressionPointerMask) !== 0) {
      throw new DnsMessageFormatError(
        `DNS name at offset ${String(offset)} uses compression, which the simulator does not read`,
      );
    }

    const labelStart = cursor + 1;
    const labelEnd = labelStart + length;

    if (labelEnd > message.length) {
      throw new DnsMessageFormatError(
        `DNS name at offset ${String(offset)} runs past the end of the message`,
      );
    }

    labels.push(decodeLabel(message.subarray(labelStart, labelEnd)));
    cursor = labelEnd;
  }
}

/**
 * Split a name into the labels to encode.
 *
 * A single trailing empty part is the root label of an absolute name such as
 * `example.test.`, so it is dropped rather than encoded. Any other empty label
 * means a malformed name like `a..b.test`, which is rejected in `encodeLabel`
 * rather than silently collapsed: sim Route53 name normalisation only strips
 * trailing dots, so an empty label here would encode to a different name than
 * the one stored.
 */
function splitDnsLabels(name: string): readonly string[] {
  const parts = name.split(".");

  if (parts.at(-1) === "") {
    return parts.slice(0, -1);
  }

  return parts;
}

function encodeLabel(name: string, label: string): Uint8Array {
  if (label.length === 0) {
    throw new DnsMessageFormatError(`DNS name ${name} contains an empty label`);
  }

  const labelBytes = utf8Encoder.encode(label);

  if (labelBytes.length > maxLabelLength) {
    throw new DnsMessageFormatError(
      `DNS label ${label} is ${String(labelBytes.length)} bytes, over the ${String(maxLabelLength)} byte limit`,
    );
  }

  return labelBytes;
}

/**
 * Decode a label as ASCII and lower-case it, matching how sim Route53 stores
 * names. DNS names are compared case-insensitively.
 */
function decodeLabel(labelBytes: Uint8Array): string {
  return utf8Decoder.decode(labelBytes).toLowerCase();
}

function byteAt(message: Uint8Array, offset: number): number {
  const value = message.at(offset);

  if (value === undefined) {
    throw new DnsMessageFormatError(
      `DNS message ends before offset ${String(offset)}`,
    );
  }

  return value;
}
