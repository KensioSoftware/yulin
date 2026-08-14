/**
 * The media types an Application Load Balancer passes to a Lambda target as
 * text.
 *
 * This list is ELB's own and is shorter than the one API Gateway uses. A form
 * post is the difference worth knowing about:
 * `application/x-www-form-urlencoded` is text to API Gateway and base64 to a
 * load balancer.
 */
const textMediaTypes: ReadonlySet<string> = new Set([
  "application/json",
  "application/javascript",
  "application/xml",
]);

/**
 * Decides how a request or response body crosses the boundary between HTTP
 * bytes and the string an ALB invocation event carries.
 *
 * A body with a `content-encoding` header is always base64, whatever its
 * content type, because the bytes are compressed rather than text. Without one,
 * the content type decides, and the handler is told which happened with
 * `isBase64Encoded`.
 */
export class SimElbV2BodyEncoding {
  /**
   * Whether a body is passed to the handler as text.
   *
   * An absent content type is treated as binary, as ELB does, because nothing
   * says the bytes are decodable text.
   */
  isText(contentType: string | null, contentEncoding: string | null): boolean {
    if (contentEncoding !== null) {
      return false;
    }

    if (contentType === null) {
      return false;
    }

    const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";

    if (mediaType.startsWith("text/")) {
      return true;
    }

    return textMediaTypes.has(mediaType);
  }

  /**
   * Encode request body bytes for the handler event.
   *
   * A text body that is not valid UTF-8 throws rather than being decoded into
   * replacement characters. Real ELB fails the invocation for the same reason,
   * with `LambdaBadRequest` in its logs and a 502 for the client, so a handler
   * never sees a body silently rewritten on its way in.
   */
  encode(
    bytes: Uint8Array,
    contentType: string | null,
    contentEncoding: string | null,
  ): string {
    if (this.isText(contentType, contentEncoding)) {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
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
