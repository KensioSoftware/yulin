import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import type { SimRoute53Zone } from "../zone/sim-route53-zone.js";
import {
  simRoute53LocalName,
  simRoute53LogicalName,
} from "../local-name/sim-route53-local-name.js";

const s3WebsiteServiceLabel = "s3-website";
const cloudFrontServiceLabel = "cloudfront";
const maxCnameDepth = 8;

interface SimRoute53ResolverProps {
  readonly zone: SimRoute53Zone;
}

/**
 * Resolves Yulin-local hostnames through simulated Route53 records.
 */
export class SimRoute53Resolver {
  private readonly zone: SimRoute53Zone;

  constructor(props: SimRoute53ResolverProps) {
    this.zone = props.zone;
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
    const visitedNames = new Set<string>();

    for (let depth = 0; depth <= maxCnameDepth; depth += 1) {
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

      const cname = this.zone.record(logicalName, "CNAME");
      const cnameTarget = cname?.values[0];
      if (cnameTarget === undefined || cnameTarget.length === 0) {
        return undefined;
      }

      localName = simRoute53LocalName(cnameTarget);
    }

    /* v8 ignore next -- defensive fallback */
    return undefined;
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

    if (labels.length < 3) {
      return undefined;
    }

    if (labels.at(-2) !== cloudFrontServiceLabel || labels.at(-1) !== "net") {
      return undefined;
    }

    const distroId = labels.at(-3);
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
