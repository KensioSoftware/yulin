import { DnsMessageFormatError } from "./error/dns-message.error.js";
import { decodeDnsHeader, dnsHeaderLength } from "./wire/dns-header.js";
import { decodeDnsQuestion, type DnsQuestion } from "./wire/dns-question.js";

/**
 * A decoded DNS query the simulator can act on.
 */
export interface DnsQuery {
  readonly id: number;
  readonly opcode: number;
  readonly recursionDesired: boolean;
  readonly question: DnsQuestion;
}

/**
 * Decode a DNS query datagram.
 *
 * Only the first question is read. Multiple questions in one message are
 * permitted by the format but are not used in practice and no resolver the
 * simulator serves sends them, so the count is required to be exactly one
 * rather than being partially handled.
 *
 * Anything after the question — an EDNS0 OPT record in the additional section,
 * for instance — is ignored. Ignoring OPT is how a server without EDNS support
 * behaves, and resolvers fall back cleanly when no OPT comes back.
 */
export function decodeDnsQuery(message: Uint8Array): DnsQuery {
  const header = decodeDnsHeader(message);

  if (header.questionCount !== 1) {
    throw new DnsMessageFormatError(
      `DNS query carries ${String(header.questionCount)} questions, and the simulator answers exactly one`,
    );
  }

  const { question } = decodeDnsQuestion(message, dnsHeaderLength);

  return {
    id: header.id,
    opcode: header.opcode,
    recursionDesired: header.recursionDesired,
    question,
  };
}
