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
 * The characters an HTTP field name holds, which is the RFC 9110 token.
 */
const httpFieldName = /^[!#$%&'*+.^_`|~\w-]+$/u;

/**
 * Reads the identity source expressions an authorizer is configured with.
 *
 * An expression naming somewhere this simulation does not read from is refused
 * rather than accepted and looked for nowhere, since an authorizer that never
 * finds what it looks for refuses every request, which looks like a signing
 * problem rather than a configuration one. That leaves out the rest of
 * `$context` and all of `$stageVariables`, which a Lambda `REQUEST` authorizer
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
        this.headerName(
          expression,
          expression.slice(simHttpApiHeaderIdentityPrefix.length),
        ),
      );
    }

    if (expression.startsWith(simHttpApiQueryStringIdentityPrefix)) {
      return new SimHttpApiQueryStringIdentitySource(
        this.named(
          expression,
          expression.slice(simHttpApiQueryStringIdentityPrefix.length),
          "query string parameter",
        ),
      );
    }

    throw new SimApiGatewayV2BadRequest(
      `IdentitySource '${expression}' is not simulated: an identity source ` +
        `is ${this.simulatedForms(alsoSimulated)}`,
    );
  }

  /**
   * The header an expression names, refusing one no request could carry.
   *
   * A header name is an HTTP field name, and anything else is refused here
   * rather than at request time: reading a header by an invalid name throws,
   * and it would throw on every request to the route rather than on the
   * command that configured it.
   */
  private headerName(expression: string, name: string): string {
    const headerName = this.named(expression, name, "header");

    if (!httpFieldName.test(headerName)) {
      throw new SimApiGatewayV2BadRequest(
        `IdentitySource '${expression}' names the header '${headerName}', ` +
          `which is not a header name: an HTTP field name holds letters, ` +
          `digits and the characters !#$%&'*+-.^_\`|~`,
      );
    }

    return headerName;
  }

  /**
   * The name an expression carries after its prefix, refusing an empty one.
   *
   * An expression naming nothing finds nothing on every request, so the
   * authorizer refuses everyone for a reason that reads like a signing problem
   * rather than the configuration one it is.
   */
  private named(expression: string, name: string, what: string): string {
    if (name.length === 0) {
      throw new SimApiGatewayV2BadRequest(
        `IdentitySource '${expression}' names no ${what}, so it would find ` +
          `nothing on every request`,
      );
    }

    return name;
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
