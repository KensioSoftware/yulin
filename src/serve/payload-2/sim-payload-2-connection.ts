import { faker } from "@faker-js/faker";

/**
 * The client address a simulated invocation is reported as coming from.
 *
 * Requests reach a simulated endpoint over localhost or not over a socket at
 * all, so there is no remote address to report. Everything a handler can see
 * about the caller's network origin says loopback rather than pretending to a
 * public address the simulation does not have.
 */
export const simPayload2SourceIp = "127.0.0.1";

/**
 * Build the X-Ray trace header AWS stamps on a proxied request.
 *
 * Real AWS uses `Root=1-<epoch seconds in hex>-<24 hex digits>`, so the id
 * encodes when the trace started. Nothing here is a real trace: X-Ray is not
 * simulated, and this exists because a handler reading `x-amzn-trace-id`
 * should find the shape it would find on AWS rather than nothing at all.
 */
export function simPayload2TraceId(at: Date): string {
  const startedAt = Math.floor(at.getTime() / 1000)
    .toString(16)
    .padStart(8, "0");

  return `Root=1-${startedAt}-${faker.helpers.fromRegExp(/[0-9a-f]{24}/)}`;
}
