import type { SimCreateAuthorizerCommandInput } from "../command/authorizer/authorizer.command.js";
import type { SimHttpApiOpenApiObject } from "./sim-http-api-openapi-object.js";
import type { SimHttpApiOpenApiSecurityRequirement } from "./sim-http-api-openapi-operation.js";
import { SimHttpApiOpenApiSecurityScheme } from "./sim-http-api-openapi-security-scheme.js";
import type { SimHttpApiOpenApiValue } from "./sim-http-api-openapi-value.js";

interface SimHttpApiOpenApiSecuritySchemesProperties {
  readonly schemes: SimHttpApiOpenApiValue;
}

/**
 * The `components.securitySchemes` an operation's security requirement names.
 *
 * One authorizer is created per scheme name, shared by every operation naming
 * it, which is what an HTTP API has: an authorizer belongs to the API rather
 * than to a route. A scheme nothing names creates nothing, so it is never read
 * and never refused.
 */
export class SimHttpApiOpenApiSecuritySchemes {
  private readonly schemes: SimHttpApiOpenApiValue;
  private readonly created = new Map<string, string>();

  constructor(properties: SimHttpApiOpenApiSecuritySchemesProperties) {
    this.schemes = properties.schemes;
  }

  /**
   * The CreateAuthorizer input the scheme a requirement names asks for.
   */
  authorizerInput(
    apiId: string,
    requirement: SimHttpApiOpenApiSecurityRequirement,
  ): SimCreateAuthorizerCommandInput {
    const scheme = new SimHttpApiOpenApiSecurityScheme(
      this.scheme(requirement),
    );

    return scheme.createAuthorizerInput(apiId, requirement.schemeName);
  }

  /**
   * The authorizer already created for a scheme, if one was.
   */
  createdId(schemeName: string): string | undefined {
    return this.created.get(schemeName);
  }

  /**
   * Remember the authorizer created for a scheme, so the next operation naming
   * it shares that one.
   */
  remember(schemeName: string, authorizerId: string): void {
    this.created.set(schemeName, authorizerId);
  }

  /**
   * The security scheme a requirement names, refusing one the document does
   * not define.
   */
  private scheme(
    requirement: SimHttpApiOpenApiSecurityRequirement,
  ): SimHttpApiOpenApiObject {
    const schemes = this.schemes.optionalObject();

    if (schemes?.has(requirement.schemeName) !== true) {
      throw requirement.value.refusal(
        `names the security scheme '${requirement.schemeName}', which ` +
          `${this.schemes.pointer.toString()} does not define`,
      );
    }

    return schemes.member(requirement.schemeName).object();
  }
}
