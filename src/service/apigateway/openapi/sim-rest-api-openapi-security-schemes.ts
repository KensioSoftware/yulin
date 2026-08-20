import type { SimRestApiAuthorizerView } from "../api/authorizer/sim-rest-api-authorizer.js";
import type { SimCreateAuthorizerCommandInput } from "../command/authorizer/authorizer.command.js";
import type { SimRestApiOpenApiObject } from "./sim-rest-api-openapi-object.js";
import type { SimRestApiOpenApiSecurityRequirement } from "./sim-rest-api-openapi-operation.js";
import type { SimRestApiOpenApiPointer } from "./sim-rest-api-openapi-pointer.js";
import { SimRestApiOpenApiSecurityScheme } from "./sim-rest-api-openapi-security-scheme.js";
import type { SimRestApiOpenApiValue } from "./sim-rest-api-openapi-value.js";

/**
 * What one security scheme comes to.
 */
export interface SimRestApiOpenApiSchemeAuthorizer {
  /**
   * The authorizer to create, or nothing when the scheme declares a method
   * decided by IAM, which asks no authorizer anything.
   */
  readonly input: SimCreateAuthorizerCommandInput | undefined;
  /** Where the scheme is, for a refusal CreateAuthorizer makes about it. */
  readonly pointer: SimRestApiOpenApiPointer;
}

interface SimRestApiOpenApiSecuritySchemesProperties {
  readonly schemes: SimRestApiOpenApiValue;
}

/**
 * The `components.securitySchemes` an operation's security requirement names.
 *
 * One authorizer is created per scheme name, shared by every method naming it,
 * which is what a REST API has: an authorizer belongs to the API rather than
 * to a method. A scheme nothing names creates nothing, so it is never read and
 * never refused.
 */
export class SimRestApiOpenApiSecuritySchemes {
  private readonly schemes: SimRestApiOpenApiValue;
  private readonly created = new Map<string, SimRestApiAuthorizerView>();

  constructor(properties: SimRestApiOpenApiSecuritySchemesProperties) {
    this.schemes = properties.schemes;
  }

  /**
   * What the scheme a requirement names gates its methods with.
   */
  authorizer(
    restApiId: string,
    requirement: SimRestApiOpenApiSecurityRequirement,
  ): SimRestApiOpenApiSchemeAuthorizer {
    const scheme = this.scheme(requirement);

    return {
      input: new SimRestApiOpenApiSecurityScheme(scheme).createAuthorizerInput(
        restApiId,
        requirement.schemeName,
      ),
      pointer: scheme.pointer,
    };
  }

  /**
   * The authorizer already created for a scheme, if one was.
   */
  createdAuthorizer(schemeName: string): SimRestApiAuthorizerView | undefined {
    return this.created.get(schemeName);
  }

  /**
   * Remember the authorizer created for a scheme, so the next method naming it
   * shares that one.
   */
  remember(schemeName: string, authorizer: SimRestApiAuthorizerView): void {
    this.created.set(schemeName, authorizer);
  }

  /**
   * The security scheme a requirement names, refusing one the document does
   * not define.
   */
  private scheme(
    requirement: SimRestApiOpenApiSecurityRequirement,
  ): SimRestApiOpenApiObject {
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
