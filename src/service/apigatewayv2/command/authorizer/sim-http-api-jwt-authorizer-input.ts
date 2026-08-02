import { SimHttpApiIdentitySource } from "../../api/authorizer/sim-http-api-identity-source.js";
import { SimHttpApiJwtConfiguration } from "../../api/authorizer/sim-http-api-jwt-configuration.js";
import { SimApiGatewayV2BadRequest } from "../../error/sim-api-gateway-v2.error.js";
import type { SimCreateAuthorizerCommandInput } from "./authorizer.command.js";

/**
 * Reads the two structured inputs a JWT authorizer is created from.
 *
 * Both are refused when they are missing or malformed rather than defaulted.
 * An authorizer with no issuer would trust nothing and refuse every request,
 * and an authorizer with no identity source would look for the token nowhere,
 * and both of those look like a signing problem to whoever hits the route.
 */
export class SimHttpApiJwtAuthorizerInput {
  private readonly input: SimCreateAuthorizerCommandInput;

  constructor(input: SimCreateAuthorizerCommandInput) {
    this.input = input;
  }

  /**
   * The one header or query string parameter the token is read from.
   */
  identitySource(): SimHttpApiIdentitySource {
    const sources = this.input.IdentitySource ?? [];

    if (sources.length === 0) {
      throw new SimApiGatewayV2BadRequest(
        "CreateAuthorizer requires IdentitySource",
      );
    }

    if (sources.length > 1) {
      throw new SimApiGatewayV2BadRequest(
        `CreateAuthorizer IdentitySource has ${String(sources.length)} ` +
          `entries: more than one identity source is not simulated, and only ` +
          `the first would be read here`,
      );
    }

    return SimHttpApiIdentitySource.parse(sources[0] ?? "");
  }

  /**
   * The issuer this authorizer trusts and the audiences it accepts.
   */
  jwtConfiguration(): SimHttpApiJwtConfiguration {
    const configuration = this.input.JwtConfiguration;

    if (configuration === undefined) {
      throw new SimApiGatewayV2BadRequest(
        "CreateAuthorizer requires JwtConfiguration",
      );
    }

    return new SimHttpApiJwtConfiguration({
      issuer: this.issuer(configuration.Issuer),
      audience: this.audience(configuration.Audience),
    });
  }

  private issuer(issuer: string | undefined): string {
    if (issuer === undefined || issuer.length === 0) {
      throw new SimApiGatewayV2BadRequest(
        "CreateAuthorizer requires JwtConfiguration.Issuer",
      );
    }

    return issuer;
  }

  /**
   * The audiences the authorizer accepts.
   *
   * AWS does not document what an authorizer with an empty audience list
   * accepts. Requiring one here may be stricter than AWS is, and it is the
   * safe direction to be stricter in: an authorizer that states its audiences
   * cannot quietly admit an app client nobody meant to admit.
   */
  private audience(audience: readonly string[] | undefined): readonly string[] {
    if (audience === undefined || audience.length === 0) {
      throw new SimApiGatewayV2BadRequest(
        "CreateAuthorizer requires JwtConfiguration.Audience: what an " +
          "authorizer with no audience accepts is not documented by AWS, and " +
          "is not simulated",
      );
    }

    return [...audience];
  }
}
