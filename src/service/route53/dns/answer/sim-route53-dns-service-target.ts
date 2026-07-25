import { simRoute53LocalName } from "../../local-name/sim-route53-local-name.js";
import { SimRoute53ServiceTargetResolver } from "../../resolve/sim-r53-service-target-resolver.js";
import type { SimRoute53RecordType } from "../../record/sim-route53-record.js";
import { dnsInternetClass, dnsRecordTypeNumber } from "../dns-record-type.js";
import { encodeDnsRdata } from "../rdata/dns-rdata.js";
import type { DnsResourceRecord } from "../wire/dns-resource-record.js";

const serviceTargetTtl = 60;

/**
 * Synthesise the address record for a name owned by a simulated service.
 *
 * A CNAME pointing at a simulated S3 website or CloudFront hostname has no
 * address record behind it, because those hostnames are recognised by shape
 * rather than stored in a hosted zone. Answering with the address the local
 * server listens on is what makes a DNS lookup and an HTTP request for the same
 * name describe the same thing.
 */
export class SimRoute53DnsServiceTarget {
  private readonly resolver = new SimRoute53ServiceTargetResolver();
  private readonly serviceAddress: string;

  constructor(serviceAddress: string) {
    this.serviceAddress = serviceAddress;
  }

  /**
   * Address records for a name owned by a simulated service, if it is one.
   *
   * `targetName` is the hostname to recognise; `answerName` is the name the
   * record is answered under. They differ for an alias record, which Route53
   * answers under the name holding it rather than under the target.
   */
  answersFor(
    targetName: string,
    answerName: string,
    recordType: SimRoute53RecordType,
  ): readonly DnsResourceRecord[] {
    if (recordType !== "A") {
      return [];
    }

    const target = this.resolver.resolve(simRoute53LocalName(targetName));

    if (target === undefined) {
      return [];
    }

    return [
      {
        name: answerName,
        type: dnsRecordTypeNumber("A"),
        class: dnsInternetClass,
        ttl: serviceTargetTtl,
        rdata: encodeDnsRdata("A", this.serviceAddress),
      },
    ];
  }
}
