import { assertDefined } from "../../../util/type-guard/defined.js";
import { simRestApiOpenApiIamAuthorization } from "./sim-rest-api-openapi-iam-authorization.js";
import type { SimRestApiOpenApiPointer } from "./sim-rest-api-openapi-pointer.js";
import type { SimRestApiOpenApiValue } from "./sim-rest-api-openapi-value.js";

/**
 * The operation members that decide who may call the method and are not read
 * out of a document.
 */
const refusedOperationMembers: readonly (readonly [string, string])[] = [
  [
    "x-amazon-apigateway-api-key-source",
    "API keys and usage plans are not simulated",
  ],
  [
    "x-amazon-apigateway-request-validator",
    "request validation is not simulated, so a request the document declares " +
      "as invalid still reaches the handler",
  ],
];

interface SimRestApiOpenApiOperationProperties {
  readonly httpMethod: string;
  readonly value: SimRestApiOpenApiValue;
}

/**
 * What one operation says about who may call the method it becomes.
 */
export interface SimRestApiOpenApiSecurityRequirement {
  /** The `components.securitySchemes` member the requirement names. */
  readonly schemeName: string;
  /** The scopes the method asks the presented token for. */
  readonly scopes: readonly string[];
  /** The requirement itself, so a refusal about it names where it is. */
  readonly value: SimRestApiOpenApiValue;
}

/**
 * One operation of the document being imported: the method it becomes, the
 * integration behind it, and who may call it.
 *
 * `requestBody`, the content schemas under `responses`, `parameters`,
 * `summary`, `description` and `tags` are all ignored, which is what AWS does
 * with them where no request validator names them. `operationId` is ignored
 * too, since it only supplies the `OperationName` a method carries for
 * documentation.
 */
export class SimRestApiOpenApiOperation {
  public readonly httpMethod: string;
  private readonly value: SimRestApiOpenApiValue;

  constructor(properties: SimRestApiOpenApiOperationProperties) {
    this.httpMethod = properties.httpMethod;
    this.value = properties.value;
  }

  /**
   * Where in the document this operation is, for a refusal about the method it
   * becomes.
   */
  pointer(): SimRestApiOpenApiPointer {
    return this.value.pointer;
  }

  /**
   * The integration this method routes to.
   */
  integration(): SimRestApiOpenApiValue {
    const operation = this.value.object();

    for (const [name, reason] of refusedOperationMembers) {
      operation.refuseMember(name, reason);
    }

    const integration = operation.member("x-amazon-apigateway-integration");

    if (integration.absent()) {
      throw integration.refusal(
        "is required: an operation with no integration would become a method " +
          "answering 500, because API Gateway has nothing to send the " +
          "request to",
      );
    }

    return integration;
  }

  /**
   * The one security requirement this operation carries, if it carries any.
   *
   * More than one is refused. One authorizer decides a method, and a second
   * requirement would be dropped here and refused by AWS.
   */
  security(): SimRestApiOpenApiSecurityRequirement | undefined {
    const security = this.value.object().member("security");
    const requirements = security.optionalArray();

    if (requirements === undefined || requirements.length === 0) {
      return undefined;
    }

    if (requirements.length > 1) {
      throw security.refusal(
        `carries ${String(requirements.length)} security requirements, and a ` +
          `method is decided by one authorizer, so only the first would be ` +
          `applied here`,
      );
    }

    const [requirement] = requirements;
    assertDefined(requirement, "the security requirement just counted");

    return this.requirement(requirement);
  }

  /**
   * Whether this operation asks for the method to be decided by IAM, which a
   * document writes as `x-amazon-apigateway-auth`.
   */
  iamAuthorization(): boolean {
    return simRestApiOpenApiIamAuthorization(this.value.object());
  }

  /**
   * The scheme and scopes one security requirement names.
   */
  private requirement(
    value: SimRestApiOpenApiValue,
  ): SimRestApiOpenApiSecurityRequirement {
    const requirement = value.object();
    const schemeNames = requirement.memberNames();

    if (schemeNames.length !== 1) {
      throw requirement.refusal(
        `names ${String(schemeNames.length)} security schemes, and a method ` +
          `is decided by one authorizer, so only one scheme can be applied ` +
          `to it`,
      );
    }

    const [schemeName] = schemeNames;
    assertDefined(schemeName, "the security scheme name just counted");
    // A member the document carries is never absent, so the scopes are the
    // list it wrote or a refusal about the shape it wrote instead.
    const scopes = requirement.member(schemeName).optionalStringList();
    assertDefined(scopes, `the scopes of the ${schemeName} requirement`);

    return { schemeName, scopes, value };
  }
}
