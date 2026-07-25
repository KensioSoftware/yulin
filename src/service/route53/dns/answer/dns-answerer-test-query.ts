import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimRoute53RecordType } from "../../record/sim-route53-record.js";
import { dnsInternetClass, dnsRecordTypeNumber } from "../dns-record-type.js";
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
 * Build a question for a name and record type.
 * @internal
 */
export function testQuestion(
  name: string,
  type: SimRoute53RecordType,
): DnsQuestion {
  return {
    name,
    type: dnsRecordTypeNumber(type),
    class: dnsInternetClass,
  };
}
