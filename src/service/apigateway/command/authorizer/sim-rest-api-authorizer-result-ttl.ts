import type { SimRestApiAuthorizerType } from "../../api/authorizer/sim-rest-api-authorizer.js";
import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";
import type { SimCreateAuthorizerCommandInput } from "./authorizer.command.js";

/**
 * The longest AWS holds a REST API authorizer's decision for.
 */
const maximumResultTtlSeconds = 3600;

/**
 * How long an authorizer's decisions are held for.
 *
 * Zero, and saying nothing, both mean no caching, which is what AWS defaults
 * an authorizer to. AWS accepts a whole number of seconds up to an hour, so
 * anything else is refused rather than held for a period no deployed
 * authorizer could be configured with. That includes `NaN`, which no
 * comparison refuses and which would otherwise hold a decision for ever.
 *
 * A `COGNITO_USER_POOLS` authorizer asking for a period is refused. Real API
 * Gateway holds its decision too, and holding one here would mean a token that
 * expired during the period was still accepted. Nothing is invoked either way,
 * so the only thing caching changes for that kind of authorizer is the answer
 * a test would get.
 */
export function simRestApiAuthorizerResultTtl(
  input: SimCreateAuthorizerCommandInput,
  type: SimRestApiAuthorizerType,
): number {
  const ttl = input.authorizerResultTtlInSeconds ?? 0;

  if (!Number.isSafeInteger(ttl) || ttl < 0 || ttl > maximumResultTtlSeconds) {
    throw new SimApiGatewayBadRequest(
      `CreateAuthorizer authorizerResultTtlInSeconds is ${String(ttl)}: AWS ` +
        `holds an authorizer's decision for a whole number of seconds ` +
        `between 0 and ${String(maximumResultTtlSeconds)}`,
    );
  }

  if (type === "COGNITO_USER_POOLS" && ttl > 0) {
    throw new SimApiGatewayBadRequest(
      "CreateAuthorizer authorizerResultTtlInSeconds is set on a " +
        "COGNITO_USER_POOLS authorizer, which invokes nothing and verifies " +
        "each token as it arrives: holding that decision is not simulated",
    );
  }

  return ttl;
}
