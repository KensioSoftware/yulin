import type { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";
import { dnsRcodes, type DnsRcode } from "../dns-rcode.js";
import {
  dnsInternetClass,
  simRoute53RecordTypeFromNumber,
} from "../dns-record-type.js";
import type { DnsQuestion } from "../wire/dns-question.js";
import type { DnsResourceRecord } from "../wire/dns-resource-record.js";
import { simRoute53DnsAnswerRecords } from "./sim-route53-dns-record-answer.js";
import { SimRoute53DnsRecordChase } from "./sim-route53-dns-record-chase.js";
import { SimRoute53DnsServiceTarget } from "./sim-route53-dns-service-target.js";
import { simRoute53DnsSoaRecord } from "./sim-route53-dns-soa.js";
import { SimRoute53DnsZoneFinder } from "./sim-route53-dns-zone-finder.js";

export interface SimRoute53DnsAnswer {
  readonly rcode: DnsRcode;
  readonly answers: readonly DnsResourceRecord[];
  readonly authority: readonly DnsResourceRecord[];
}

interface SimRoute53DnsAnswererProperties {
  readonly hostedZones: ReadonlyMap<string, SimRoute53HostedZone>;
  /** Address returned for names that resolve to a simulated service. */
  readonly serviceAddress: string;
}

/**
 * Answer DNS questions from the simulated hosted zones.
 *
 * This is the DNS counterpart of `SimRoute53Resolver`, which resolves an HTTP
 * hostname to a service target. The two are deliberately separate: an HTTP
 * request only needs to know which simulated service handles a host, while a
 * DNS answer needs record types, CNAME chains and the difference between a name
 * that does not exist and a name holding no record of the queried type.
 */
export class SimRoute53DnsAnswerer {
  private readonly zoneFinder: SimRoute53DnsZoneFinder;
  private readonly chase: SimRoute53DnsRecordChase;
  private readonly serviceTarget: SimRoute53DnsServiceTarget;

  constructor(properties: SimRoute53DnsAnswererProperties) {
    this.zoneFinder = new SimRoute53DnsZoneFinder(properties.hostedZones);
    this.chase = new SimRoute53DnsRecordChase(this.zoneFinder);
    this.serviceTarget = new SimRoute53DnsServiceTarget(
      properties.serviceAddress,
    );
  }

  /**
   * Answer one question.
   *
   * A name held by no hosted zone is refused rather than reported as missing,
   * because the simulator is authoritative only for the zones it holds and
   * "refused" says so, where NXDOMAIN would claim the name exists nowhere.
   */
  answer(question: DnsQuestion): SimRoute53DnsAnswer {
    if (question.class !== dnsInternetClass) {
      return refused();
    }

    const hostedZone = this.zoneFinder.find(question.name);

    if (hostedZone === undefined) {
      return refused();
    }

    const recordType = simRoute53RecordTypeFromNumber(question.type);

    // A query type the simulator cannot encode is answered as no data rather
    // than as an error, which is what a resolver expects for a type a zone
    // simply does not hold.
    if (recordType === undefined) {
      return this.negative(hostedZone, dnsRcodes.noError, []);
    }

    const chased = this.chase.chase(question.name, recordType);
    const answers = [
      ...chased.records.flatMap((record) => simRoute53DnsAnswerRecords(record)),
      ...this.serviceTarget.answersFor(
        chased.finalName,
        chased.answerName,
        recordType,
      ),
    ];

    if (answers.length > 0) {
      return { rcode: dnsRcodes.noError, answers, authority: [] };
    }

    return this.negative(hostedZone, this.negativeRcode(chased.finalName), []);
  }

  /**
   * A name the zone holds under some other record type is a no-data answer; a
   * name it does not hold at all does not exist.
   */
  private negativeRcode(name: string): DnsRcode {
    const hostedZone = this.zoneFinder.find(name);

    if (hostedZone === undefined) {
      return dnsRcodes.nameError;
    }

    const nameExists = hostedZone.records
      .list()
      .some((record) => record.name === name);

    if (nameExists) {
      return dnsRcodes.noError;
    }

    return dnsRcodes.nameError;
  }

  private negative(
    hostedZone: SimRoute53HostedZone,
    rcode: DnsRcode,
    answers: readonly DnsResourceRecord[],
  ): SimRoute53DnsAnswer {
    return {
      rcode,
      answers,
      authority: [simRoute53DnsSoaRecord(hostedZone)],
    };
  }
}

function refused(): SimRoute53DnsAnswer {
  return { rcode: dnsRcodes.refused, answers: [], authority: [] };
}
