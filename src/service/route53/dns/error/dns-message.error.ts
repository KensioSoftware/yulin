/**
 * A DNS message could not be read as valid wire format.
 *
 * The simulator answers real DNS clients, so a malformed or truncated datagram
 * is an expected condition rather than a bug: it is reported as a format error
 * and the query is refused instead of crashing the server.
 */
export class DnsMessageFormatError extends Error {
  public override readonly name = "DnsMessageFormatError";
}
