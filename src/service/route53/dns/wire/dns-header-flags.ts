import type { DnsRcode } from "../dns-rcode.js";

const queryResponseFlag = 0x80_00;
const authoritativeAnswerFlag = 0x04_00;
const recursionDesiredFlag = 0x01_00;
const opcodeShift = 11;
const opcodeMask = 0x0f;
const rcodeMask = 0x0f;

/**
 * Opcode 0 is a standard query. The simulator answers no other opcode.
 */
export const dnsStandardQueryOpcode = 0;

interface DnsResponseFlagProperties {
  readonly rcode: DnsRcode;
  readonly recursionDesired: boolean;
}

/**
 * Read the opcode out of a header's flag word.
 */
export function dnsOpcodeFromFlags(flags: number): number {
  return (flags >> opcodeShift) & opcodeMask;
}

/**
 * Whether the sender asked for recursion.
 */
export function dnsRecursionDesiredFromFlags(flags: number): boolean {
  return (flags & recursionDesiredFlag) !== 0;
}

/**
 * Build the flag word for a response.
 *
 * Responses are always authoritative, because the simulator only ever answers
 * for zones it holds itself. Recursion available is left unset and the query's
 * recursion desired bit is echoed back, which is what a resolver expects from
 * an authoritative server that does not recurse.
 */
export function dnsResponseFlags(
  properties: DnsResponseFlagProperties,
): number {
  let flags = queryResponseFlag | authoritativeAnswerFlag;

  if (properties.recursionDesired) {
    flags |= recursionDesiredFlag;
  }

  return flags | (properties.rcode & rcodeMask);
}
