import { isRecord } from "../../../../util/type-guard/record.js";
import { SimCognitoClaimsOverride } from "./sim-cognito-claims-override.js";
import {
  refuseSimCognitoResponse,
  requireSimCognitoResponseObject,
  requireSimCognitoResponseStrings,
} from "./sim-cognito-claims-override-values.js";
import { readSimCognitoGroupOverride } from "./sim-cognito-group-override.js";
import {
  requireSimCognitoOverridableClaim,
  requireSimCognitoSuppressibleClaim,
} from "./sim-cognito-reserved-claims.js";

/**
 * Reads what a `PreTokenGeneration` handler wrote into its response.
 *
 * A V1_0 response carries `claimsOverrideDetails`, and everything this reads is
 * inside it. Anything a handler could write that this simulation would not act
 * on is refused rather than dropped, because a claim that quietly does not
 * arrive is the failure a test with a trigger in it is there to catch.
 */
export class SimCognitoClaimsOverrideReader {
  /**
   * The override the event a handler returned asks for.
   *
   * A handler that wrote nothing, and one that was never invoked because the
   * pool has no such trigger, both give an empty override.
   */
  read(returned: unknown): SimCognitoClaimsOverride {
    const details = this.details(returned);

    if (details === undefined) {
      return SimCognitoClaimsOverride.none();
    }

    return new SimCognitoClaimsOverride({
      added: this.added(details["claimsToAddOrOverride"]),
      suppressed: this.suppressed(details["claimsToSuppress"]),
      groups: readSimCognitoGroupOverride(details),
    });
  }

  private details(returned: unknown): Record<string, unknown> | undefined {
    if (!isRecord(returned)) {
      return undefined;
    }

    const response: unknown = returned["response"];

    if (!isRecord(response)) {
      return undefined;
    }

    const details: unknown = response["claimsOverrideDetails"];

    if (details === undefined || details === null) {
      return undefined;
    }

    return requireSimCognitoResponseObject(details, "claimsOverrideDetails");
  }

  /**
   * The claims to add or override, which a V1_0 response carries as strings.
   *
   * A value of any other type is refused. Complex claim values arrived with the
   * V2_0 event, which this simulation does not run, so accepting one here would
   * put a claim on a token that a deployed V1_0 trigger would not.
   */
  private added(value: unknown): ReadonlyMap<string, string> {
    const added = new Map<string, string>();

    if (value === undefined || value === null) {
      return added;
    }

    const claims = Object.entries(
      requireSimCognitoResponseObject(value, "claimsToAddOrOverride"),
    );

    for (const [claim, claimValue] of claims) {
      requireSimCognitoOverridableClaim(claim);

      if (typeof claimValue !== "string") {
        refuseSimCognitoResponse(
          `a claimsToAddOrOverride value for ${claim} that is not a string. ` +
            `A V1_0 trigger event carries claim values as strings, and the ` +
            `complex values arrived with the V2_0 event.`,
        );
      }

      added.set(claim, claimValue);
    }

    return added;
  }

  private suppressed(value: unknown): ReadonlySet<string> {
    const suppressed = new Set<string>();
    const claims = requireSimCognitoResponseStrings(value, "claimsToSuppress");

    for (const claim of claims) {
      requireSimCognitoSuppressibleClaim(claim);
      suppressed.add(claim);
    }

    return suppressed;
  }
}
