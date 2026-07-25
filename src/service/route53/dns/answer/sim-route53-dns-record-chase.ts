import type {
  SimRoute53Record,
  SimRoute53RecordType,
} from "../../record/sim-route53-record.js";
import type { SimRoute53DnsZoneFinder } from "./sim-route53-dns-zone-finder.js";

const maxCnameDepth = 8;

export interface SimRoute53DnsChase {
  /** Records to place in the answer section, in the order they were followed. */
  readonly records: readonly SimRoute53Record[];
  /** The name the chase stopped at, which is where a negative answer applies. */
  readonly finalName: string;
  /**
   * The name a synthesised address record should carry.
   *
   * Following a CNAME moves it to the target, because that is where the address
   * lives. Following an alias leaves it alone: Route53 answers an alias under
   * the name that holds it, the alias itself never appearing in the answer.
   */
  readonly answerName: string;
}

/**
 * Follow CNAME records looking for a record of the queried type.
 *
 * A resolver asking for an A record at a name held by a CNAME expects the CNAME
 * and the record it leads to in the same answer, so the chain is walked here
 * rather than leaving the resolver to ask again.
 *
 * The walk is bounded twice over: visited names stop a cycle immediately, and a
 * maximum depth stops a chain that is merely too long.
 */
export class SimRoute53DnsRecordChase {
  private readonly zoneFinder: SimRoute53DnsZoneFinder;

  constructor(zoneFinder: SimRoute53DnsZoneFinder) {
    this.zoneFinder = zoneFinder;
  }

  /**
   * Collect the records answering a query for one name and record type.
   */
  chase(name: string, recordType: SimRoute53RecordType): SimRoute53DnsChase {
    const records: SimRoute53Record[] = [];
    const visitedNames = new Set<string>();
    let currentName = name;
    let answerName = name;

    for (let depth = 0; depth <= maxCnameDepth; depth += 1) {
      if (visitedNames.has(currentName)) {
        return { records, finalName: currentName, answerName };
      }
      visitedNames.add(currentName);

      const step = this.followName(currentName, recordType);

      if (step === undefined) {
        return { records, finalName: currentName, answerName };
      }

      if (step.record !== undefined) {
        // Answered under the name the query reached through visible records, so
        // a record found behind an alias still carries the alias owner's name.
        records.push({ ...step.record, name: answerName });
        return { records, finalName: currentName, answerName };
      }

      if (step.visible) {
        answerName = step.nextName;
      }

      records.push(...step.emit);
      currentName = step.nextName;
    }

    return { records, finalName: currentName, answerName };
  }

  /**
   * Take one step: collect a matching record and stop, or report the name to
   * continue from.
   */
  private followName(
    name: string,
    recordType: SimRoute53RecordType,
  ): ChaseStep | undefined {
    const hostedZone = this.zoneFinder.find(name);

    if (hostedZone === undefined) {
      return undefined;
    }

    const exactRecord = hostedZone.records.get(name, recordType);

    if (exactRecord !== undefined) {
      // An alias record holds a hostname rather than data of its own type, so
      // it is followed rather than answered, and stays out of the answer.
      if (exactRecord.alias === true) {
        return followedTo(exactRecord.values.at(0), false, []);
      }

      return { record: exactRecord, nextName: name, visible: false, emit: [] };
    }

    // A CNAME query wants the CNAME itself, so there is nothing to follow.
    if (recordType === "CNAME") {
      return undefined;
    }

    const cname = hostedZone.records.get(name, "CNAME");

    if (cname === undefined) {
      return undefined;
    }

    return followedTo(cname.values.at(0), true, [cname]);
  }
}

interface ChaseStep {
  /** Set when the chase found the record it was looking for. */
  readonly record?: SimRoute53Record | undefined;
  readonly nextName: string;
  /** Whether the followed record appears in the answer, as a CNAME does. */
  readonly visible: boolean;
  /** Records the followed step contributes to the answer. */
  readonly emit: readonly SimRoute53Record[];
}

function followedTo(
  nextName: string | undefined,
  visible: boolean,
  emit: readonly SimRoute53Record[],
): ChaseStep | undefined {
  if (nextName === undefined) {
    return undefined;
  }

  return { nextName, visible, emit };
}
