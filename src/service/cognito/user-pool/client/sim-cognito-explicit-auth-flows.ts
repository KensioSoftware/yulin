import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

/**
 * The authentication flows Cognito has replaced, kept for app clients made
 * before the `ALLOW_` prefixed values existed.
 */
const legacyAuthFlows: readonly string[] = [
  "ADMIN_NO_SRP_AUTH",
  "CUSTOM_AUTH_FLOW_ONLY",
  "USER_PASSWORD_AUTH",
];

const currentAuthFlows: readonly string[] = [
  "ALLOW_ADMIN_USER_PASSWORD_AUTH",
  "ALLOW_CUSTOM_AUTH",
  "ALLOW_REFRESH_TOKEN_AUTH",
  "ALLOW_USER_AUTH",
  "ALLOW_USER_PASSWORD_AUTH",
  "ALLOW_USER_SRP_AUTH",
];

/**
 * The flows an app client supports when its request named none.
 *
 * Sign-in with a username and password is deliberately not among them, which
 * is why `USER_PASSWORD_AUTH` fails on a client nobody configured.
 */
const defaultAuthFlows: readonly string[] = [
  "ALLOW_REFRESH_TOKEN_AUTH",
  "ALLOW_USER_SRP_AUTH",
  "ALLOW_CUSTOM_AUTH",
];

/**
 * The authentication flows one simulated app client supports.
 *
 * This is the setting that decides whether an authentication request reaches
 * the pool at all, so the values are validated rather than stored as written:
 * a typo in a flow name would otherwise turn into a puzzling sign-in failure
 * much later.
 */
export class SimCognitoExplicitAuthFlows {
  public readonly values: readonly string[];

  constructor(requested: readonly string[] | undefined) {
    if (requested === undefined || requested.length === 0) {
      this.values = defaultAuthFlows;
      return;
    }

    for (const flow of requested) {
      SimCognitoExplicitAuthFlows.requireKnown(flow);
    }

    SimCognitoExplicitAuthFlows.refuseMixedGenerations(requested);

    this.values = [...requested];
  }

  private static requireKnown(flow: string): void {
    if (legacyAuthFlows.includes(flow) || currentAuthFlows.includes(flow)) {
      return;
    }

    throw new SimCognitoInvalidParameterException(
      `ExplicitAuthFlows '${flow}' is not a Cognito authentication flow: ` +
        `use one of ${currentAuthFlows.join(", ")}`,
    );
  }

  /**
   * Refuse a request naming both a legacy flow and an `ALLOW_` prefixed one,
   * as real Cognito refuses it.
   */
  private static refuseMixedGenerations(requested: readonly string[]): void {
    const hasLegacy = requested.some((flow) => legacyAuthFlows.includes(flow));
    const hasCurrent = requested.some((flow) =>
      currentAuthFlows.includes(flow),
    );

    if (hasLegacy && hasCurrent) {
      throw new SimCognitoInvalidParameterException(
        "ExplicitAuthFlows cannot mix the legacy flows " +
          `(${legacyAuthFlows.join(", ")}) with the ALLOW_ prefixed ones`,
      );
    }
  }

  /**
   * Whether the client supports an authentication flow.
   */
  allows(flow: string): boolean {
    return this.values.includes(flow);
  }
}
