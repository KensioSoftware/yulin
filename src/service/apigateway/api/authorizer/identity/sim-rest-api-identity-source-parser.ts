import { SimApiGatewayBadRequest } from "../../../error/sim-api-gateway.error.js";
import {
  SimRestApiHeaderIdentitySource,
  simRestApiHeaderIdentityPrefix,
} from "./sim-rest-api-header-identity-source.js";
import type { SimRestApiIdentitySource } from "./sim-rest-api-identity-source.js";
import {
  SimRestApiQueryStringIdentitySource,
  simRestApiQueryStringIdentityPrefix,
} from "./sim-rest-api-query-string-identity-source.js";

/**
 * The characters an HTTP field name holds, which is the RFC 9110 token.
 */
const httpFieldName = /^[!#$%&'*+.^_`|~\w-]+$/u;

/**
 * Reads the identity source expressions a REST API authorizer is configured
 * with.
 *
 * An expression naming somewhere this simulation does not read from is refused
 * rather than accepted and looked for nowhere, since an authorizer that never
 * finds what it looks for refuses every request, which looks like a signing
 * problem rather than the configuration one it is. That leaves out
 * `method.request.path`, `context` and `stageVariables`, which a `REQUEST`
 * authorizer may also name on AWS.
 *
 * A `TOKEN` authorizer reads one header and nothing else, which is the rule
 * real API Gateway holds one to, so it parses with `header`.
 */
export class SimRestApiIdentitySourceParser {
  /**
   * Read the one header a `TOKEN` authorizer takes its token from.
   */
  header(expression: string): SimRestApiIdentitySource {
    if (!expression.startsWith(simRestApiHeaderIdentityPrefix)) {
      throw new SimApiGatewayBadRequest(
        `identitySource '${expression}' is not simulated: a TOKEN ` +
          `authorizer reads one header, written as ` +
          `'${simRestApiHeaderIdentityPrefix}<name>'`,
      );
    }

    return this.headerSource(expression);
  }

  /**
   * Read one expression of a `REQUEST` authorizer's identity source.
   */
  parse(expression: string): SimRestApiIdentitySource {
    if (expression.startsWith(simRestApiHeaderIdentityPrefix)) {
      return this.headerSource(expression);
    }

    if (expression.startsWith(simRestApiQueryStringIdentityPrefix)) {
      return new SimRestApiQueryStringIdentitySource(
        this.named(
          expression,
          expression.slice(simRestApiQueryStringIdentityPrefix.length),
          "query string parameter",
        ),
      );
    }

    throw new SimApiGatewayBadRequest(
      `identitySource '${expression}' is not simulated: a REQUEST ` +
        `authorizer reads request headers and query string parameters, ` +
        `written as '${simRestApiHeaderIdentityPrefix}<name>' or ` +
        `'${simRestApiQueryStringIdentityPrefix}<name>'`,
    );
  }

  /**
   * The header an expression names, refusing one no request could carry.
   *
   * A header name is an HTTP field name, and anything else is refused here
   * rather than at request time: reading a header by an invalid name throws,
   * and it would throw on every request to the method rather than on the
   * command that configured it.
   */
  private headerSource(expression: string): SimRestApiIdentitySource {
    const name = this.named(
      expression,
      expression.slice(simRestApiHeaderIdentityPrefix.length),
      "header",
    );

    if (!httpFieldName.test(name)) {
      throw new SimApiGatewayBadRequest(
        `identitySource '${expression}' names the header '${name}', which ` +
          `is not a header name: an HTTP field name holds letters, digits ` +
          `and the characters !#$%&'*+-.^_\`|~`,
      );
    }

    return new SimRestApiHeaderIdentitySource(name);
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
      throw new SimApiGatewayBadRequest(
        `identitySource '${expression}' names no ${what}, so it would find ` +
          `nothing on every request`,
      );
    }

    return name;
  }
}
