import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import {
  simRoute53LocalName,
  simRoute53LogicalName,
} from "../local-name/sim-route53-local-name.js";
import type { SimRoute53Record } from "../record/sim-route53-record.js";
import type { SimRoute53HostedZone } from "../hosted-zone/sim-route53-hosted-zone.js";

const s3WebsiteServiceLabel = "s3-website";
const cloudFrontServiceLabel = "cloudfront";
const maxCnameDepth = 8;

interface SimRoute53ResolverProps {
  readonly hostedZones: ReadonlyMap<string, SimRoute53HostedZone>;
}

/**
 * Resolves Yulin-local hostnames through simulated Route53 hosted-zone records.
 */
export class SimRoute53Resolver {
  private readonly hostedZones: ReadonlyMap<string, SimRoute53HostedZone>;

  constructor(props: SimRoute53ResolverProps) {
    this.hostedZones = props.hostedZones;
  }

  /**
   * Resolve a Yulin-local HTTP hostname to a simulated AWS service target.
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

      const directTarget = this.builtinLocalServiceTarget(localName);
      if (directTarget !== undefined) {
        return directTarget;
      }

      const logicalName = simRoute53LogicalName(localName);
      /* v8 ignore if -- defensive check */
      if (logicalName === undefined) {
        return undefined;
      }

      const cname = this.record(logicalName, "CNAME");
      const cnameTarget = cname?.values[0];
      if (cnameTarget === undefined || cnameTarget.length === 0) {
        return undefined;
      }

      localName = simRoute53LocalName(cnameTarget);
    }

    /* v8 ignore next -- defensive fallback */
    return undefined;
  }

  private record(name: string, type: "CNAME"): SimRoute53Record | undefined {
    for (const hostedZone of this.hostedZones.values()) {
      const record = hostedZone.records.get(name, type);
      if (record !== undefined) {
        return record;
      }
    }

    return;
  }

  private builtinLocalServiceTarget(
    hostname: string,
  ): SimAwsServiceTarget | undefined {
    const logicalName = simRoute53LogicalName(hostname);
    /* v8 ignore if -- defensive check */
    if (logicalName === undefined) {
      return undefined;
    }

    return (
      this.s3WebsiteServiceTarget(logicalName) ??
      this.cloudFrontServiceTarget(logicalName)
    );
  }

  private s3WebsiteServiceTarget(
    logicalName: string,
  ): SimAwsServiceTarget | undefined {
    const labels = logicalName.split(".");

    if (labels.length < 3) {
      return undefined;
    }

    const service = labels.at(-2);
    const regionName = labels.at(-1) as AwsRegionName | undefined;

    if (service !== s3WebsiteServiceLabel || regionName === undefined) {
      return undefined;
    }

    const resourceName = labels.slice(0, -2).join(".");

    /* v8 ignore if -- defensive check */
    if (resourceName.length === 0 || regionName.length === 0) {
      return undefined;
    }

    return {
      service: "s3",
      resourceName,
      regionName,
    };
  }

  private cloudFrontServiceTarget(
    logicalName: string,
  ): SimAwsServiceTarget | undefined {
    const labels = logicalName.split(".");

    if (labels.length !== 3) {
      return undefined;
    }

    const [distroId, service, topLevelDomain] = labels;

    if (service !== cloudFrontServiceLabel || topLevelDomain !== "net") {
      return undefined;
    }

    /* v8 ignore if -- defensive check */
    if (distroId === undefined || distroId.length === 0) {
      return undefined;
    }

    return {
      service: "cloudFront",
      resourceName: distroId,
    };
  }
}
