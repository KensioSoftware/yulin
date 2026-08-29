import type { Brand } from "../../../util/brand.type.js";
import type { SimCloudFrontOrigin } from "../origin/sim-cloudfront-origin.js";
import type { SimCfRedundantOrigin } from "../origin/sim-cf-redundant-origins.js";
import type { SimCloudFrontBehavior } from "../behaviour/sim-cloud-front-behavior.js";
import type { SimCloudFrontCustomErrorResponse } from "../custom-error/sim-cloudfront-custom-error-response.js";
import { faker } from "@faker-js/faker";
import {
  makeSimAwsAccountId,
  type SimAwsAccountId,
} from "../../aws/sim-aws-account.js";
import type { SimCloudFrontDistributionConfig } from "../command/create-distribution/create-distribution.command.js";
import { type SimClock, SimRealClock } from "../../../util/clock/sim-clock.js";
import { SimCloudFrontDistributionNotDisabled } from "../error/sim-cloudfront.error.js";
import { SimCfDistributionCache } from "../cache/sim-cf-distribution-cache.js";

export type SimCloudFrontDistributionId = Brand<
  string,
  "SimCloudFrontDistributionId"
>;

export type SimCloudFrontDistributionStatus = "Deploying" | "Deployed";

interface SimCloudFrontDistributionProperties {
  readonly distributionId?: SimCloudFrontDistributionId;
  readonly status?: SimCloudFrontDistributionStatus;
  readonly accountId?: SimAwsAccountId;
  readonly distributionConfig?: SimCloudFrontDistributionConfig;
  /**
   * Clock stamping this Distribution's last modified time and expiring what its
   * cache holds. A Distribution built standalone, outside a SimAws instance,
   * falls back to the real clock.
   */
  readonly clock?: SimClock;
}

/**
 * Simulated CloudFront Distribution.
 */
export class SimCloudFrontDistribution {
  public readonly distributionId: SimCloudFrontDistributionId;
  public readonly accountId: SimAwsAccountId;
  public readonly behaviors: SimCloudFrontBehavior[] = [];
  public readonly customErrorResponses: SimCloudFrontCustomErrorResponse[] = [];
  public readonly lastModifiedTime: Date;

  /**
   * The clock this Distribution reads, which its cache expires on.
   */
  public readonly clock: SimClock;

  /**
   * What this Distribution has cached, keyed by cache key.
   *
   * A configuration update leaves it alone, as it leaves a real
   * Distribution's cached objects alone: an object cached under the old
   * configuration is served until it expires or something removes it.
   */
  public readonly cache: SimCfDistributionCache;

  #status: SimCloudFrontDistributionStatus;
  #distributionConfig: SimCloudFrontDistributionConfig | undefined;
  #enabled: boolean;
  #defaultRootObject: string | undefined;
  #webAclArn: string | undefined;
  #redundantOrigins: readonly SimCfRedundantOrigin[] = [];
  private readonly alternateDomainNames = new Set<string>();

  private readonly origins = new Map<string, SimCloudFrontOrigin>();

  constructor(properties: SimCloudFrontDistributionProperties = {}) {
    const {
      distributionId = makeDistributionId(),
      status = "Deployed",
      accountId = makeSimAwsAccountId(),
      distributionConfig,
      clock = new SimRealClock(),
    } = properties;

    this.clock = clock;
    this.cache = new SimCfDistributionCache(clock);
    this.lastModifiedTime = clock.now();
    this.distributionId = distributionId;
    this.#status = status;
    this.accountId = accountId;
    this.#distributionConfig = distributionConfig;
    this.#enabled = distributionConfig?.Enabled ?? true;
  }

  /**
   * Get the current Status of this sim Distribution.
   */
  get status(): SimCloudFrontDistributionStatus {
    return this.#status;
  }

  /**
   * Get the DistributionConfig this sim Distribution was configured from.
   */
  get distributionConfig(): SimCloudFrontDistributionConfig | undefined {
    return this.#distributionConfig;
  }

  /**
   * Whether this sim Distribution is enabled, and so serving requests.
   */
  get enabled(): boolean {
    return this.#enabled;
  }

  /**
   * Get the object this sim Distribution serves for a request to its root.
   */
  get defaultRootObject(): string | undefined {
    return this.#defaultRootObject;
  }

  /**
   * Set the object this sim Distribution serves for a request to its root.
   */
  set defaultRootObject(defaultRootObject: string | undefined) {
    this.#defaultRootObject = defaultRootObject;
  }

  /**
   * The ARN of the web ACL this sim Distribution is behind, if any.
   *
   * CloudFront names its web ACL in the DistributionConfig rather than through
   * WAFv2's AssociateWebACL, so this is read from the config the same way the
   * default root object is.
   */
  get webAclArn(): string | undefined {
    return this.#webAclArn;
  }

  /**
   * Set the ARN of the web ACL this sim Distribution is behind.
   */
  set webAclArn(webAclArn: string | undefined) {
    this.#webAclArn = webAclArn;
  }

  /**
   * The Origins of this sim Distribution that repeat another of its Origins.
   *
   * Each one is an Origin the config declared twice under two Ids. Both are
   * served the same way here, whichever Behavior points at them. A test can
   * assert this list is empty to say the Distribution declares each of its
   * Origins once.
   */
  get redundantOrigins(): readonly SimCfRedundantOrigin[] {
    return this.#redundantOrigins;
  }

  /**
   * Record the Origins of this sim Distribution that repeat another of them.
   */
  set redundantOrigins(redundantOrigins: readonly SimCfRedundantOrigin[]) {
    this.#redundantOrigins = redundantOrigins;
  }

  /**
   * Move the sim Distribution into Deployed status.
   */
  completeDeployment(): Promise<void> {
    this.#status = "Deployed";
    return Promise.resolve();
  }

  /**
   * Replace this sim Distribution's configuration, clearing everything derived
   * from the previous one.
   *
   * CloudFront takes a whole DistributionConfig on an update rather than a
   * patch, so an update is a replacement here too: the caller applies the new
   * config from scratch, the same way creation does. The Distribution goes
   * back into Deploying while that happens, as it does in AWS.
   */
  replaceConfiguration(
    distributionConfig: SimCloudFrontDistributionConfig,
  ): void {
    this.#distributionConfig = distributionConfig;
    this.#enabled = distributionConfig.Enabled ?? true;
    this.#status = "Deploying";
    this.#defaultRootObject = undefined;
    this.#webAclArn = undefined;
    this.#redundantOrigins = [];
    this.behaviors.length = 0;
    this.customErrorResponses.length = 0;
    this.alternateDomainNames.clear();
    this.origins.clear();
  }

  /**
   * Refuse deletion while this sim Distribution is still enabled.
   *
   * CloudFront will not delete a Distribution that is still serving, so the
   * real sequence is UpdateDistribution with `Enabled: false` and then
   * DeleteDistribution. Nothing here waits for the disable to deploy, which
   * real CloudFront does before it accepts the deletion.
   */
  assertDeletable(): void {
    if (this.#enabled) {
      throw new SimCloudFrontDistributionNotDisabled(
        `Sim CloudFront Distribution ${this.distributionId} is enabled, so it cannot be deleted. Disable it with UpdateDistribution first.`,
      );
    }
  }

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
   * Add a custom error response to this sim Distribution.
   */
  addCustomErrorResponse(
    customErrorResponse: SimCloudFrontCustomErrorResponse,
  ): void {
    this.customErrorResponses.push(customErrorResponse);
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
    /E[0-9A-Z]{13}/,
  ) as SimCloudFrontDistributionId;
}
