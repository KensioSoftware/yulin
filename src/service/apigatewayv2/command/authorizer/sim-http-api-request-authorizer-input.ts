import type { SimHttpApiAuthorizerId } from "../../api/authorizer/sim-http-api-authorizer.js";
import { SimHttpApiIdentitySource } from "../../api/authorizer/sim-http-api-identity-source.js";
import { SimHttpApiIdentitySources } from "../../api/authorizer/sim-http-api-identity-sources.js";
import {
  simHttpApiAuthorizerPayloadFormatVersion,
  SimHttpApiRequestAuthorizer,
} from "../../api/authorizer/sim-http-api-request-authorizer.js";
import { SimHttpApiLambdaUri } from "../../api/integration/sim-http-api-lambda-uri.js";
import { SimApiGatewayV2BadRequest } from "../../error/sim-api-gateway-v2.error.js";
import { SimApiGatewayV2UnsimulatedInput } from "../sim-api-gateway-v2-unsimulated-input.js";
import type { SimCreateAuthorizerCommandInput } from "./authorizer.command.js";
import type { SimHttpApiAuthorizerInput } from "./sim-http-api-authorizer-input.js";
import { SimHttpApiAuthorizerOptions } from "./sim-http-api-authorizer-options.js";

/**
 * Reads the inputs a Lambda `REQUEST` authorizer is created from.
 *
 * The function and the payload format are both required rather than defaulted.
 * An authorizer naming no function has nothing to ask, and API Gateway itself
 * defaults the payload format to `1.0`, which builds a different event and is
 * refused across this simulation, so it is named rather than assumed.
 */
export class SimHttpApiRequestAuthorizerInput implements SimHttpApiAuthorizerInput {
  private readonly input: SimCreateAuthorizerCommandInput;
  private readonly options = new SimHttpApiAuthorizerOptions("REQUEST");

  constructor(input: SimCreateAuthorizerCommandInput) {
    this.input = input;
  }

  /**
   * The `REQUEST` authorizer this input asks for.
   */
  read(authorizerId: SimHttpApiAuthorizerId): SimHttpApiRequestAuthorizer {
    this.options.refuse(
      "JwtConfiguration",
      this.input.JwtConfiguration,
      "and a REQUEST authorizer verifies no token: its function decides",
    );
    this.refuseResultCache();
    this.requirePayloadFormatVersion();

    return new SimHttpApiRequestAuthorizer({
      authorizerId,
      name: this.input.Name ?? "",
      lambdaUri: this.lambdaUri(),
      identitySources: this.identitySources(),
      enableSimpleResponses: this.input.EnableSimpleResponses ?? false,
    });
  }

  /**
   * The function this authorizer invokes.
   *
   * An `AuthorizerUri` is written in the same wrapped form an integration URI
   * is, so it is read by the same parser and refused for the same reasons.
   */
  private lambdaUri(): SimHttpApiLambdaUri {
    const uri = this.input.AuthorizerUri;

    if (uri === undefined || uri.length === 0) {
      throw new SimApiGatewayV2BadRequest(
        "CreateAuthorizer with AuthorizerType REQUEST requires AuthorizerUri",
      );
    }

    return SimHttpApiLambdaUri.parseAuthorizerUri(uri);
  }

  /**
   * Require payload format 2.0 by name.
   *
   * A `REQUEST` authorizer with no payload format is a `1.0` authorizer on
   * real AWS, which builds a different event and answers in a different shape,
   * so an unstated format is refused rather than read as the one simulated.
   */
  private requirePayloadFormatVersion(): void {
    const version = this.input.AuthorizerPayloadFormatVersion;

    if (version === undefined) {
      throw new SimApiGatewayV2BadRequest(
        "CreateAuthorizer with AuthorizerType REQUEST requires " +
          "AuthorizerPayloadFormatVersion: AWS defaults it to '1.0', which " +
          "builds a different event and is not simulated",
      );
    }

    new SimApiGatewayV2UnsimulatedInput("CreateAuthorizer").refuseUnless(
      "AuthorizerPayloadFormatVersion",
      version,
      simHttpApiAuthorizerPayloadFormatVersion,
      "a 1.0 authorizer receives a different event and answers a policy " +
        "against a method ARN, and none of that is built here",
    );
  }

  /**
   * Refuse a result cache, which is a decision this simulation never reuses.
   *
   * Zero is the value that switches caching off, so it is what an authorizer
   * behaving as this one does is configured with, and is accepted.
   */
  private refuseResultCache(): void {
    const ttl = this.input.AuthorizerResultTtlInSeconds;

    if (ttl === undefined || ttl === 0) {
      return;
    }

    throw new SimApiGatewayV2BadRequest(
      `CreateAuthorizer AuthorizerResultTtlInSeconds is ${String(ttl)}: ` +
        `caching an authorizer's decision is not simulated, so every request ` +
        `would invoke the function here and one in ${String(ttl)} would on ` +
        `real AWS`,
    );
  }

  /**
   * The identity sources every request has to carry before the function is
   * invoked at all.
   *
   * At least one is required. An authorizer with none is invoked for every
   * request on real AWS, including requests carrying nothing, and that is a
   * different thing from the authorizer this simulation runs, so it is refused
   * rather than treated as an authorizer nothing gates.
   */
  private identitySources(): SimHttpApiIdentitySources {
    const sources = this.input.IdentitySource ?? [];

    if (sources.length === 0) {
      throw new SimApiGatewayV2BadRequest(
        "CreateAuthorizer requires IdentitySource: an authorizer with none " +
          "is invoked for every request on AWS, including one carrying " +
          "nothing, and that is not simulated",
      );
    }

    return new SimHttpApiIdentitySources(
      sources.map((source) => SimHttpApiIdentitySource.parse(source)),
    );
  }
}
