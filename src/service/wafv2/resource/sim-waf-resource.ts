import { randomUUID } from "node:crypto";

import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimWafOptimisticLockException } from "../error/sim-wafv2.error.js";
import { type SimWafResourceKind, simWafArn } from "../sim-wafv2-arn.js";
import type { SimWafScope } from "../scope/sim-waf-scope.js";

/**
 * What every WAFv2 resource reports about itself in a listing.
 */
export interface SimWafResourceSummary {
  readonly Name: string;
  readonly Id: string;
  readonly Description: string | undefined;
  readonly LockToken: string;
  readonly ARN: string;
}

export interface SimWafResourceProperties {
  readonly name: string;
  readonly scope: SimWafScope;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly description?: string | undefined;
}

/**
 * What a web ACL, an IP set and a regex pattern set have in common.
 *
 * All three are named within a scope, carry a generated id that is part of
 * their ARN, and are written through a lock token. The token is the part worth
 * sharing rather than repeating: WAFv2 changes it on every write and refuses a
 * write made against a stale one, which is how two callers editing the same
 * rules find out about each other.
 */
export abstract class SimWafResource {
  public readonly name: string;
  public readonly scope: SimWafScope;
  public readonly id: string = randomUUID();
  public readonly arn: string;
  #description: string | undefined;
  #lockToken: string = randomUUID();

  protected constructor(
    kind: SimWafResourceKind,
    properties: SimWafResourceProperties,
  ) {
    this.name = properties.name;
    this.scope = properties.scope;
    this.#description = properties.description;
    this.arn = simWafArn({
      accountRegionScope: properties.accountRegionScope,
      scope: properties.scope,
      kind,
      name: this.name,
      id: this.id,
    });
  }

  /**
   * What the resource was created or last updated with as its description.
   */
  get description(): string | undefined {
    return this.#description;
  }

  /**
   * The token the next write to this resource has to present.
   */
  get lockToken(): string {
    return this.#lockToken;
  }

  /**
   * What a listing reports about this resource.
   */
  summary(): SimWafResourceSummary {
    return {
      Name: this.name,
      Id: this.id,
      Description: this.#description,
      LockToken: this.#lockToken,
      ARN: this.arn,
    };
  }

  /**
   * Check the token a write presented and move it on.
   *
   * A caller holding a token from before somebody else's write is refused, so
   * two changes made from the same read cannot both land.
   */
  takeLock(lockToken: string | undefined): void {
    if (lockToken !== this.#lockToken) {
      throw new SimWafOptimisticLockException(
        `AWS WAF couldn't save your changes because someone changed the ` +
          `resource after you started editing it. Retrieve the resource and ` +
          `try again.`,
      );
    }

    this.#lockToken = randomUUID();
  }

  /**
   * Take on the description a write gave.
   */
  protected replaceDescription(description: string | undefined): void {
    this.#description = description;
  }
}
