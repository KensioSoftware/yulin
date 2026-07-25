import { DnsMessageFormatError } from "../error/dns-message.error.js";
import { concatenateBytes } from "./dns-bytes.js";
import { decodeDnsName, encodeDnsName } from "./dns-name.js";

const questionFixedLength = 4;

/**
 * A single DNS question, which is all the simulator answers.
 */
export interface DnsQuestion {
  /** Normalised without a trailing dot, matching how sim Route53 stores names. */
  readonly name: string;
  readonly type: number;
  readonly class: number;
}

interface DecodedDnsQuestion {
  readonly question: DnsQuestion;
  readonly nextOffset: number;
}

/**
 * Read the question that follows the header.
 */
export function decodeDnsQuestion(
  message: Uint8Array,
  offset: number,
): DecodedDnsQuestion {
  const { name, nextOffset } = decodeDnsName(message, offset);

  if (nextOffset + questionFixedLength > message.length) {
    throw new DnsMessageFormatError(
      `DNS question at offset ${String(offset)} is missing its type and class`,
    );
  }

  const view = new DataView(
    message.buffer,
    message.byteOffset,
    message.byteLength,
  );

  return {
    question: {
      name,
      type: view.getUint16(nextOffset),
      class: view.getUint16(nextOffset + 2),
    },
    nextOffset: nextOffset + questionFixedLength,
  };
}

/**
 * Write a question back into a response.
 *
 * A resolver matches a response to its outstanding query partly on the echoed
 * question, so this has to reproduce what was asked.
 */
export function encodeDnsQuestion(question: DnsQuestion): Uint8Array {
  const name = encodeDnsName(question.name);
  const fixed = new Uint8Array(questionFixedLength);
  const view = new DataView(fixed.buffer);

  view.setUint16(0, question.type);
  view.setUint16(2, question.class);

  return concatenateBytes([name, fixed]);
}
