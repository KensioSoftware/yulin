import type { SimHttpApiAuthorizerId } from "../../api/authorizer/sim-http-api-authorizer.js";
import { SimHttpApiIdentitySourceParser } from "../../api/authorizer/identity/sim-http-api-identity-source-parser.js";
import type { SimHttpApiIdentitySource } from "../../api/authorizer/identity/sim-http-api-identity-source.js";
import { SimHttpApiJwtAuthorizer } from "../../api/authorizer/sim-http-api-jwt-authorizer.js";
import { SimHttpApiJwtConfiguration } from "../../api/authorizer/sim-http-api-jwt-configuration.js";
import { SimApiGatewayV2BadRequest } from "../../error/sim-api-gateway-v2.error.js";
import type { SimCreateAuthorizerCommandInput } from "./authorizer.command.js";
import type { SimHttpApiAuthorizerInput } from "./sim-http-api-authorizer-input.js";
import { SimHttpApiAuthorizerOptions } from "./sim-http-api-authorizer-options.js";

/**
 * Reads the two structured inputs a JWT authorizer is created from.
 *
 * Both are refused when they are missing or malformed rather than defaulted.
 * An authorizer with no issuer would trust nothing and refuse every request,
 * and an authorizer with no identity source would look for the token nowhere,
 * and both of those look like a signing problem to whoever hits the route.
 */
export class SimHttpApiJwtAuthorizerInput implements SimHttpApiAuthorizerInput {
  private readonly input: SimCreateAuthorizerCommandInput;
  private readonly options = new SimHttpApiAuthorizerOptions("JWT");
  private readonly identitySourceParser = new SimHttpApiIdentitySourceParser();

  constructor(input: SimCreateAuthorizerCommandInput) {
    this.input = input;
  }

  /**
   * The JWT authorizer this input asks for.
   */
  read(authorizerId: SimHttpApiAuthorizerId): SimHttpApiJwtAuthorizer {
    this.refuseRequestOptions();

    return new SimHttpApiJwtAuthorizer({
      authorizerId,
      name: this.input.Name ?? "",
      identitySource: this.identitySource(),
      jwtConfiguration: this.jwtConfiguration(),
    });
  }

  /**
   * Refuse the options only a Lambda `REQUEST` authorizer takes.
   *
   * Real API Gateway refuses each of these on a JWT authorizer too: there is
   * no function to invoke, no event to build and no decision to cache.
   */
  private refuseRequestOptions(): void {
    this.options.refuse(
      "AuthorizerUri",
      this.input.AuthorizerUri,
      "which names the function a REQUEST authorizer invokes, and a JWT " +
        "authorizer invokes nothing",
    );
    this.options.refuse(
      "AuthorizerPayloadFormatVersion",
      this.input.AuthorizerPayloadFormatVersion,
      "which is the format a REQUEST authorizer's event is built in, and a " +
        "JWT authorizer builds no event",
    );
    this.options.refuse(
      "EnableSimpleResponses",
      this.input.EnableSimpleResponses,
      "which chooses the shape a REQUEST authorizer answers in, and a JWT " +
        "authorizer answers nothing",
    );
    this.options.refuse(
      "AuthorizerResultTtlInSeconds",
      this.input.AuthorizerResultTtlInSeconds,
      "and a JWT authorizer caches nothing: every request is verified again",
    );
  }

  /**
   * The one header or query string parameter the token is read from.
   *
   * A JWT authorizer takes one source and API Gateway refuses a second, so the
   * rule is here rather than on the command input a `REQUEST` authorizer takes
   * a list through.
   */
  private identitySource(): SimHttpApiIdentitySource {
    const sources = this.input.IdentitySource ?? [];

    if (sources.length === 0) {
      throw new SimApiGatewayV2BadRequest(
        "CreateAuthorizer requires IdentitySource",
      );
    }

    if (sources.length > 1) {
      throw new SimApiGatewayV2BadRequest(
        `CreateAuthorizer IdentitySource has ${String(sources.length)} ` +
          `entries: a JWT authorizer takes one, and only the first would be ` +
          `read here`,
      );
    }

    // The request-only forms: a JWT authorizer reads the token the client
    // sent, so `$context.routeKey` is refused for it as it is on AWS.
    return this.identitySourceParser.requestSource(sources[0] ?? "");
  }

  /**
   * The issuer this authorizer trusts and the audiences it accepts.
   */
  private jwtConfiguration(): SimHttpApiJwtConfiguration {
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
