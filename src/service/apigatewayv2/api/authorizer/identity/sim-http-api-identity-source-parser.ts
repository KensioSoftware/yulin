import { SimApiGatewayV2BadRequest } from "../../../error/sim-api-gateway-v2.error.js";
import {
  SimHttpApiHeaderIdentitySource,
  simHttpApiHeaderIdentityPrefix,
} from "./sim-http-api-header-identity-source.js";
import type { SimHttpApiIdentitySource } from "./sim-http-api-identity-source.js";
import {
  SimHttpApiQueryStringIdentitySource,
  simHttpApiQueryStringIdentityPrefix,
} from "./sim-http-api-query-string-identity-source.js";
import {
  simHttpApiRouteKeyIdentityExpression,
  SimHttpApiRouteKeyIdentitySource,
} from "./sim-http-api-route-key-identity-source.js";

/**
 * Reads the identity source expressions an authorizer is configured with.
 *
 * An expression naming somewhere this simulation does not read from is refused
 * rather than accepted and looked for nowhere, since an authorizer that never
 * finds what it looks for refuses every request, which looks like a signing
 * problem rather than a configuration one. That leaves out the rest of
 * `$context` and all of `$stagevariables`, which a Lambda `REQUEST` authorizer
 * may also name on AWS.
 *
 * A JWT authorizer reads something the client sent and nothing else, so it
 * parses with `requestSource` and `$context.routeKey` is refused for it.
 */
export class SimHttpApiIdentitySourceParser {
  /**
   * Read an identity source of any kind a Lambda `REQUEST` authorizer takes.
   */
  parse(expression: string): SimHttpApiIdentitySource {
    if (expression === simHttpApiRouteKeyIdentityExpression) {
      return new SimHttpApiRouteKeyIdentitySource();
    }

    return this.requestSource(expression, [
      simHttpApiRouteKeyIdentityExpression,
    ]);
  }

  /**
   * Read an identity source naming something the client sent, which is all a
   * JWT authorizer takes.
   */
  requestSource(
    expression: string,
    alsoSimulated: readonly string[] = [],
  ): SimHttpApiIdentitySource {
    if (expression.startsWith(simHttpApiHeaderIdentityPrefix)) {
      return new SimHttpApiHeaderIdentitySource(
        expression.slice(simHttpApiHeaderIdentityPrefix.length),
      );
    }

    if (expression.startsWith(simHttpApiQueryStringIdentityPrefix)) {
      return new SimHttpApiQueryStringIdentitySource(
        expression.slice(simHttpApiQueryStringIdentityPrefix.length),
      );
    }

    throw new SimApiGatewayV2BadRequest(
      `IdentitySource '${expression}' is not simulated: an identity source ` +
        `is ${this.simulatedForms(alsoSimulated)}`,
    );
  }

  /**
   * How a refusal names the expressions it would have accepted instead.
   */
  private simulatedForms(alsoSimulated: readonly string[]): string {
    const forms = [
      `'${simHttpApiHeaderIdentityPrefix}<name>'`,
      `'${simHttpApiQueryStringIdentityPrefix}<name>'`,
      ...alsoSimulated.map((expression) => `'${expression}'`),
    ];
    const last = forms.pop() ?? "";

    return `${forms.join(", ")} or ${last}`;
  }
}
