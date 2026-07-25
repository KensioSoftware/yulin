import type { DnsRcode } from "../dns-rcode.js";
import { DnsMessageFormatError } from "../error/dns-message.error.js";
import {
  dnsOpcodeFromFlags,
  dnsRecursionDesiredFromFlags,
  dnsResponseFlags,
} from "./dns-header-flags.js";

export const dnsHeaderLength = 12;

/**
 * The parts of a query header the simulator acts on.
 */
export interface DnsQueryHeader {
  readonly id: number;
  readonly opcode: number;
  readonly recursionDesired: boolean;
  readonly questionCount: number;
}

interface DnsResponseHeaderProperties {
  readonly id: number;
  readonly rcode: DnsRcode;
  readonly recursionDesired: boolean;
  readonly questionCount: number;
  readonly answerCount: number;
  readonly authorityCount: number;
}

/**
 * Read the fixed 12-byte header at the start of a DNS message.
 */
export function decodeDnsHeader(message: Uint8Array): DnsQueryHeader {
  if (message.length < dnsHeaderLength) {
    throw new DnsMessageFormatError(
      `DNS message is ${String(message.length)} bytes, shorter than the ${String(dnsHeaderLength)} byte header`,
    );
  }

  const view = headerView(message);
  const flags = view.getUint16(2);

  return {
    id: view.getUint16(0),
    opcode: dnsOpcodeFromFlags(flags),
    recursionDesired: dnsRecursionDesiredFromFlags(flags),
    questionCount: view.getUint16(4),
  };
}

/**
 * Write a response header.
 *
 * The additional count is always zero: no OPT record is returned, so a client
 * that sent EDNS0 simply sees a server that does not support it.
 */
export function encodeDnsResponseHeader(
  properties: DnsResponseHeaderProperties,
): Uint8Array {
  const header = new Uint8Array(dnsHeaderLength);
  const view = new DataView(header.buffer);

  view.setUint16(0, properties.id);
  view.setUint16(2, dnsResponseFlags(properties));
  view.setUint16(4, properties.questionCount);
  view.setUint16(6, properties.answerCount);
  view.setUint16(8, properties.authorityCount);
  view.setUint16(10, 0);

  return header;
}

function headerView(message: Uint8Array): DataView {
  return new DataView(message.buffer, message.byteOffset, message.byteLength);
}
