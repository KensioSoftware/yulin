import { simCognitoGroupsClaim } from "./sim-cognito-reserved-claims.js";
import type {
  SimCognitoClaimValue,
  SimCognitoTokenClaims,
} from "./sim-cognito-token-claims.js";

interface SimCognitoClaimsOverrideProperties {
  readonly added: ReadonlyMap<string, string>;
  readonly suppressed: ReadonlySet<string>;

  /**
   * The groups the `cognito:groups` claim is to carry, or nothing when the
   * handler said nothing about groups and the user's own are to stand.
   */
  readonly groups: readonly string[] | undefined;
}

function withoutClaims(
  claims: SimCognitoTokenClaims,
  dropped: ReadonlySet<string>,
): SimCognitoTokenClaims {
  return Object.fromEntries(
    Object.entries(claims).filter(([name]) => !dropped.has(name)),
  );
}

/**
 * What a `PreTokenGeneration` handler asked to change about a token's claims.
 *
 * A pool with no such trigger, and a handler that returned the event without
 * writing a response, both produce an empty one of these, so the token layer
 * applies an override either way rather than branching on whether there is one.
 *
 * The claim changes reach the id token, which is what a V1_0 trigger customises.
 * The group override reaches the access token as well, because that is the one
 * change real Cognito lets a V1_0 event make to an access token.
 */
export class SimCognitoClaimsOverride {
  private readonly added: ReadonlyMap<string, string>;
  private readonly suppressed: ReadonlySet<string>;
  private readonly groups: readonly string[] | undefined;

  constructor(properties: SimCognitoClaimsOverrideProperties) {
    this.added = properties.added;
    this.suppressed = properties.suppressed;
    this.groups = properties.groups;
  }

  /**
   * The override a token is issued under when no handler asked for one.
   */
  static none(): SimCognitoClaimsOverride {
    return new SimCognitoClaimsOverride({
      added: new Map(),
      suppressed: new Set(),
      groups: undefined,
    });
  }

  /**
   * The id token's claims, with the handler's changes applied.
   *
   * Suppression runs last, so a claim named in both `claimsToAddOrOverride` and
   * `claimsToSuppress` is suppressed. Real Cognito resolves the pair the same
   * way round.
   */
  applyTo(claims: SimCognitoTokenClaims): SimCognitoTokenClaims {
    return withoutClaims(
      { ...this.withGroups(claims), ...this.addedClaims() },
      this.suppressed,
    );
  }

  /**
   * The access token's claims, with the group override applied and nothing
   * else.
   */
  applyGroupsTo(claims: SimCognitoTokenClaims): SimCognitoTokenClaims {
    return this.withGroups(claims);
  }

  private addedClaims(): Record<string, SimCognitoClaimValue> {
    return Object.fromEntries(this.added);
  }

  /**
   * The claims with `cognito:groups` replaced by the groups the handler named.
   *
   * A handler that named no group at all suppresses the claim rather than
   * carrying an empty list, which is what a pool does for a user in no groups.
   */
  private withGroups(claims: SimCognitoTokenClaims): SimCognitoTokenClaims {
    if (this.groups === undefined) {
      return claims;
    }

    const withoutGroups = withoutClaims(
      claims,
      new Set([simCognitoGroupsClaim]),
    );

    if (this.groups.length === 0) {
      return withoutGroups;
    }

    return { ...withoutGroups, [simCognitoGroupsClaim]: [...this.groups] };
  }
}
