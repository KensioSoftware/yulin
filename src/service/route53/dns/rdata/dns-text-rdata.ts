import { concatenateBytes } from "../wire/dns-bytes.js";

const maxCharacterStringLength = 255;
const utf8Encoder = new TextEncoder();

/**
 * Encode a TXT record value as RDATA.
 *
 * TXT RDATA is a sequence of character strings, each one a length byte followed
 * by that many bytes. A value longer than a single character string is split
 * across several, which is what a resolver reassembles.
 *
 * The value is encoded as UTF-8. DNS character strings are arbitrary bytes
 * rather than text, and UTF-8 is the convention resolvers and their callers
 * expect, so this keeps a non-ASCII TXT value readable end to end.
 */
export function encodeDnsTxtRdata(text: string): Uint8Array {
  const bytes = utf8Encoder.encode(text);
  const characterStrings: Uint8Array[] = [];

  for (
    let offset = 0;
    offset < bytes.length;
    offset += maxCharacterStringLength
  ) {
    const chunk = bytes.subarray(offset, offset + maxCharacterStringLength);
    characterStrings.push(
      concatenateBytes([Uint8Array.of(chunk.length), chunk]),
    );
  }

  if (characterStrings.length === 0) {
    // An empty TXT value is still one, empty, character string.
    return Uint8Array.of(0);
  }

  return concatenateBytes(characterStrings);
}
