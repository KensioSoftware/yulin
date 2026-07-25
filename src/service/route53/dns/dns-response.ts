import type { DnsRcode } from "./dns-rcode.js";
import { concatenateBytes } from "./wire/dns-bytes.js";
import { encodeDnsResponseHeader } from "./wire/dns-header.js";
import { encodeDnsQuestion, type DnsQuestion } from "./wire/dns-question.js";
import {
  encodeDnsResourceRecord,
  type DnsResourceRecord,
} from "./wire/dns-resource-record.js";

interface DnsResponseProperties {
  readonly id: number;
  readonly rcode: DnsRcode;
  readonly recursionDesired: boolean;
  readonly question?: DnsQuestion | undefined;
  readonly answers?: readonly DnsResourceRecord[] | undefined;
  readonly authority?: readonly DnsResourceRecord[] | undefined;
}

/**
 * Encode a DNS response datagram.
 *
 * The question is echoed back because a resolver matches a response to its
 * outstanding query on the ID and the question together. It is optional only so
 * a message too malformed to yield a question can still be answered with a
 * format error.
 *
 * The authority section carries the zone's SOA on a negative answer, which is
 * how a resolver learns how long it may cache the absence of a record.
 */
export function encodeDnsResponse(
  properties: DnsResponseProperties,
): Uint8Array {
  const { question, answers = [], authority = [] } = properties;

  const header = encodeDnsResponseHeader({
    id: properties.id,
    rcode: properties.rcode,
    recursionDesired: properties.recursionDesired,
    questionCount: questionCount(question),
    answerCount: answers.length,
    authorityCount: authority.length,
  });

  return concatenateBytes([
    header,
    ...encodedQuestion(question),
    ...answers.map((answer) => encodeDnsResourceRecord(answer)),
    ...authority.map((record) => encodeDnsResourceRecord(record)),
  ]);
}

function questionCount(question: DnsQuestion | undefined): number {
  if (question === undefined) {
    return 0;
  }

  return 1;
}

function encodedQuestion(
  question: DnsQuestion | undefined,
): readonly Uint8Array[] {
  if (question === undefined) {
    return [];
  }

  return [encodeDnsQuestion(question)];
}
