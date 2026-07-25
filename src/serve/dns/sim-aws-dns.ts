import { SimAws } from "../../service/aws/sim-aws.js";
import { SimRoute53DnsAnswerer } from "../../service/route53/dns/answer/sim-route53-dns-answerer.js";
import { decodeDnsQuery } from "../../service/route53/dns/dns-query.js";
import { dnsRcodes } from "../../service/route53/dns/dns-rcode.js";
import { encodeDnsResponse } from "../../service/route53/dns/dns-response.js";
import { dnsStandardQueryOpcode } from "../../service/route53/dns/wire/dns-header-flags.js";
import { simAwsLocalConf as simAwsLocalConfig } from "../http/local-server/sim-aws-local.conf.js";

interface SimAwsDnsProperties {
  readonly simAws?: SimAws;
  readonly serviceAddress?: string;
}

/**
 * DNS interface for a simulated AWS environment.
 *
 * Turns a query datagram into a response datagram. Holding no socket keeps this
 * testable without networking, in the same way `SimAwsHttp` handles a request
 * without owning a listener.
 */
export class SimAwsDns {
  private readonly simAws: SimAws;
  private readonly serviceAddress: string;

  constructor(properties: SimAwsDnsProperties = {}) {
    const {
      simAws = new SimAws(),
      serviceAddress = simAwsLocalConfig.loopbackAddress,
    } = properties;
    this.simAws = simAws;
    this.serviceAddress = serviceAddress;
  }

  /**
   * Answer a DNS query datagram.
   *
   * This never throws. A server on a socket has to answer whatever arrives, so
   * a datagram that cannot be read becomes a format error and an unexpected
   * failure becomes a server failure, rather than either taking the server down.
   */
  handleQuery(message: Uint8Array): Uint8Array {
    try {
      return this.answerQuery(message);
    } catch {
      return this.errorResponse(message, dnsRcodes.formatError);
    }
  }

  private answerQuery(message: Uint8Array): Uint8Array {
    const query = decodeDnsQuery(message);

    if (query.opcode !== dnsStandardQueryOpcode) {
      return encodeDnsResponse({
        id: query.id,
        rcode: dnsRcodes.notImplemented,
        recursionDesired: query.recursionDesired,
        question: query.question,
      });
    }

    const answerer = new SimRoute53DnsAnswerer({
      hostedZones: this.simAws.route53().resolvableHostedZones(),
      serviceAddress: this.serviceAddress,
    });
    const answer = answerer.answer(query.question);

    return encodeDnsResponse({
      id: query.id,
      rcode: answer.rcode,
      recursionDesired: query.recursionDesired,
      question: query.question,
      answers: answer.answers,
      authority: answer.authority,
    });
  }

  /**
   * Answer a datagram that could not be handled, echoing its ID so the resolver
   * can match the response to its outstanding query.
   */
  private errorResponse(
    message: Uint8Array,
    rcode: (typeof dnsRcodes)[keyof typeof dnsRcodes],
  ): Uint8Array {
    return encodeDnsResponse({
      id: queryId(message),
      rcode,
      recursionDesired: false,
    });
  }
}

const queryIdLength = 2;

function queryId(message: Uint8Array): number {
  if (message.length < queryIdLength) {
    return 0;
  }

  return new DataView(
    message.buffer,
    message.byteOffset,
    message.byteLength,
  ).getUint16(0);
}
