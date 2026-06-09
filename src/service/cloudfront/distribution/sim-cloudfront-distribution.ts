import type { Brand } from "../../../util/brand.type.js";
import type { SimCloudFrontOrigin } from "../origin/sim-cloudfront-origin.js";
import type { SimCloudFrontBehavior } from "../behaviour/sim-cloud-front-behavior.js";
import { faker } from "@faker-js/faker";

export type SimCloudFrontDistributionId = Brand<
  string,
  "SimCloudFrontDistributionId"
>;

/**
 * Simulated CloudFront Distribution.
 */
export class SimCloudFrontDistribution {
  private readonly alternateDomainNames = new Set<string>();
  public readonly behaviors: SimCloudFrontBehavior[] = [];
  private readonly origins = new Map<string, SimCloudFrontOrigin>();

  constructor(
    public readonly distributionId: SimCloudFrontDistributionId = makeDistributionId(),
  ) {}

  /**
   * Get the alternate domain names for this sim Distribution.
   */
  getAlternateDomainNames(): ReadonlySet<string> {
    return this.alternateDomainNames;
  }

  /**
   * Get the sim Origins of this Distribution by Origin name.
   */
  getOrigins(): ReadonlyMap<string, SimCloudFrontOrigin> {
    return this.origins;
  }

  /**
   * Add an alternate domain name for this sim Distribution.
   */
  addAlternateDomainName(alternateDomainName: string): void {
    this.alternateDomainNames.add(alternateDomainName);
  }

  /**
   * Add a Behavior to this sim Distribution.
   */
  addBehavior(behavior: SimCloudFrontBehavior): void {
    this.behaviors.push(behavior);
  }

  /**
   * Add an Origin to this sim Distribution.
   */
  addOrigin(originName: string, origin: SimCloudFrontOrigin): void {
    this.origins.set(originName, origin);
  }

  /**
   * Check whether this sim Distribution has a particular alternate domain name.
   */
  hasAlternateDomainName(alternateDomainName: string): boolean {
    return this.alternateDomainNames.has(alternateDomainName);
  }

  /**
   * Get a sim Origin of this Distribution by Origin name.
   */
  getOrigin(originName: string): SimCloudFrontOrigin | undefined {
    return this.origins.get(originName);
  }
}

/**
 * Generate a fake sim CloudFront Distribution ID.
 */
export function makeDistributionId(): SimCloudFrontDistributionId {
  return faker.helpers.fromRegExp(
    // eslint-disable-next-line unicorn/better-regex -- fromRegExp needs 0-9 not \d
    /E[0-9A-Z]{13}/,
  ) as SimCloudFrontDistributionId;
}
