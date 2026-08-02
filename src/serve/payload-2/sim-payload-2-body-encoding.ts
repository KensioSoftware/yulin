const textContentTypes: ReadonlySet<string> = new Set([
  "application/javascript",
  "application/json",
  "application/x-www-form-urlencoded",
  "application/xml",
]);

/**
 * Decides how a request or response body crosses the boundary between HTTP
 * bytes and the string a payload format 2.0 event carries.
 *
 * Real AWS passes text bodies through as UTF-8 strings and base64-encodes
 * everything else, telling the handler which happened with isBase64Encoded.
 */
export class SimPayload2BodyEncoding {
  /**
   * Whether a content type's body is passed to the handler as text.
   *
   * An absent content type is treated as binary, as AWS does, because nothing
   * says the bytes are decodable text.
   */
  isText(contentType: string | null): boolean {
    if (contentType === null) {
      return false;
    }

    const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";

    if (mediaType.startsWith("text/")) {
      return true;
    }

    if (mediaType.endsWith("+json") || mediaType.endsWith("+xml")) {
      return true;
    }

    return textContentTypes.has(mediaType);
  }

  /**
   * Encode request body bytes for the handler event.
   */
  encode(bytes: Uint8Array, contentType: string | null): string {
    if (this.isText(contentType)) {
      return new TextDecoder().decode(bytes);
    }

    return Buffer.from(bytes).toString("base64");
  }

  /**
   * Decode a handler's response body into the bytes sent to the client.
   */
  decode(body: string, isBase64Encoded: boolean): Uint8Array | string {
    if (isBase64Encoded) {
      return new Uint8Array(Buffer.from(body, "base64"));
    }

    return body;
  }
}
