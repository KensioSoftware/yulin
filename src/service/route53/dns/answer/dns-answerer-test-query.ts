import type { SimAws } from "../../../aws/sim-aws.js";
import {
  dnsInternetClass,
  dnsRecordTypeNumber,
  type SimRoute53DnsRecordType,
} from "../dns-record-type.js";
import type { DnsQuestion } from "../wire/dns-question.js";
import { SimRoute53DnsAnswerer } from "./sim-route53-dns-answerer.js";

/**
 * Build an answerer over every hosted zone in a simulated environment.
 * @internal
 */
export function testAnswerer(simAws: SimAws): SimRoute53DnsAnswerer {
  return new SimRoute53DnsAnswerer({
    hostedZones: simAws.route53().resolvableHostedZones(),
    serviceAddress: "127.0.0.1",
  });
}

/**
 * Build a question for a name and a record type simulated DNS answers.
 *
 * A question about a stored type with no wire number here, such as `MX`, is
 * built by naming the number, as a real resolver's query carries it.
 * @internal
 */
export function testQuestion(
  name: string,
  type: SimRoute53DnsRecordType,
): DnsQuestion {
  return {
    name,
    type: dnsRecordTypeNumber(type),
    class: dnsInternetClass,
  };
}
