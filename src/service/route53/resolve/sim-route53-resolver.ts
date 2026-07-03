import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import {
  simRoute53LocalName,
  simRoute53LogicalName,
} from "../local-name/sim-route53-local-name.js";
import type { SimRoute53HostedZone } from "../hosted-zone/sim-route53-hosted-zone.js";
import { SimRoute53HostedZoneRecordFinder } from "./sim-r53-zone-record-finder.js";
import type { SimRoute53Record } from "../record/sim-route53-record.js";
import { SimRoute53ServiceTargetResolver } from "./sim-r53-service-target-resolver.js";

const maxCnameDepth = 8;

interface SimRoute53ResolverProps {
  readonly hostedZones: ReadonlyMap<string, SimRoute53HostedZone>;
}

/**
 * Resolves Yulin-local hostnames through simulated Route53 hosted-zone records.
 */
export class SimRoute53Resolver {
  private readonly recordFinder: SimRoute53HostedZoneRecordFinder;
  private readonly serviceTargetResolver =
    new SimRoute53ServiceTargetResolver();

  constructor(props: SimRoute53ResolverProps) {
    this.recordFinder = new SimRoute53HostedZoneRecordFinder(props.hostedZones);
  }

  /**
   * Resolve a Yulin-local HTTP hostname to a simulated AWS service target.
   *
   * Resolution follows the same shape used by local integration tests:
   *
   * 1. Strip the Yulin localhost suffix to get the logical Route53 name.
   * 2. Check whether that name already points at a built-in simulated service.
   * 3. If not, follow CNAME or alias records to the next hostname.
   * 4. Stop when a service target is found, a chain breaks, a cycle appears, or
   *    the maximum CNAME depth is reached.
   */
  resolveHttpHost(hostname: string): SimAwsServiceTarget | undefined {
    const initialLogicalName = simRoute53LogicalName(hostname);
    if (initialLogicalName === undefined) {
      return undefined;
    }

    let localName = simRoute53LocalName(initialLogicalName);

    // Track visited CNAME names so cyclic records fail immediately instead of
    // relying on maxCnameDepth to eventually stop the resolution loop.
    const visitedNames = new Set<string>();

    for (let depth = 0; depth <= maxCnameDepth; depth += 1) {
      /* v8 ignore if */
      if (visitedNames.has(localName)) {
        return undefined;
      }
      visitedNames.add(localName);

      const directTarget = this.serviceTargetResolver.resolve(localName);
      if (directTarget !== undefined) {
        return directTarget;
      }

      const logicalName = simRoute53LogicalName(localName);
      /* v8 ignore if -- defensive check */
      if (logicalName === undefined) {
        return undefined;
      }

      const nextRecord = this.findNextResolutionRecord(logicalName);
      const nextTarget = nextRecord?.values[0];
      if (nextTarget === undefined || nextTarget.length === 0) {
        return undefined;
      }

      localName = simRoute53LocalName(nextTarget);
    }

    /* v8 ignore next -- defensive fallback */
    return undefined;
  }

  /**
   * Find the next record to follow while resolving a local HTTP hostname.
   *
   * CNAME records are checked first because they are the direct name-to-name
   * Route53 mechanism. Alias A and AAAA records are then accepted only when the
   * stored record is marked as an alias, because ordinary address records do not
   * contain another simulated service hostname.
   */
  private findNextResolutionRecord(
    logicalName: string,
  ): SimRoute53Record | undefined {
    const cname = this.recordFinder.findRecord(logicalName, "CNAME");
    if (cname !== undefined) {
      return cname;
    }

    const aAlias = this.recordFinder.findRecord(logicalName, "A");
    if (aAlias?.alias === true) {
      return aAlias;
    }

    const aaaaAlias = this.recordFinder.findRecord(logicalName, "AAAA");
    if (aaaaAlias?.alias === true) {
      return aaaaAlias;
    }

    return undefined;
  }
}
