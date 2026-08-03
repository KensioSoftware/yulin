import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimHttpApiOpenApiPointer } from "./sim-http-api-openapi-pointer.js";
import type { SimHttpApiOpenApiValue } from "./sim-http-api-openapi-value.js";

interface SimHttpApiOpenApiOperationProperties {
  readonly routeKey: string;
  readonly value: SimHttpApiOpenApiValue;
}

/**
 * What one operation says about who may call the route it becomes.
 */
export interface SimHttpApiOpenApiSecurityRequirement {
  /** The `components.securitySchemes` member the requirement names. */
  readonly schemeName: string;
  /** The scopes the route asks the presented token for. */
  readonly scopes: readonly string[];
  /** The requirement itself, so a refusal about it names where it is. */
  readonly value: SimHttpApiOpenApiValue;
}

/**
 * One operation of the document being imported: the route it becomes, the
 * integration behind it, and who may call it.
 *
 * `requestBody`, the content schemas under `responses`, `parameters`,
 * `summary`, `description` and `tags` are all ignored, which is what AWS does
 * with them. HTTP APIs validate no requests, so there is nothing for any of
 * them to configure. `operationId` is ignored too, since no command here takes
 * the `OperationName` AWS maps it to.
 */
export class SimHttpApiOpenApiOperation {
  public readonly routeKey: string;
  private readonly value: SimHttpApiOpenApiValue;

  constructor(properties: SimHttpApiOpenApiOperationProperties) {
    this.routeKey = properties.routeKey;
    this.value = properties.value;
  }

  /**
   * Where in the document this operation is, for a refusal about the route it
   * becomes.
   */
  pointer(): SimHttpApiOpenApiPointer {
    return this.value.pointer;
  }

  /**
   * The integration this operation routes to, which may be a `$ref` into the
   * reusable definitions rather than the integration itself.
   */
  integration(): SimHttpApiOpenApiValue {
    const integration = this.value
      .object()
      .member("x-amazon-apigateway-integration");

    if (integration.absent()) {
      throw integration.refusal(
        "is required: an operation with no integration would become a route " +
          "with nothing behind it",
      );
    }

    return integration;
  }

  /**
   * The one security requirement this operation carries, if it carries any.
   *
   * More than one is refused, which is what AWS does: an HTTP API route has
   * one authorizer, so a second requirement would be dropped here and refused
   * there.
   */
  security(): SimHttpApiOpenApiSecurityRequirement | undefined {
    const security = this.value.object().member("security");
    const requirements = security.optionalArray();

    if (requirements === undefined || requirements.length === 0) {
      return undefined;
    }

    if (requirements.length > 1) {
      throw security.refusal(
        `carries ${String(requirements.length)} security requirements, and a ` +
          `route has one authorizer, so only the first would be applied here`,
      );
    }

    const [requirement] = requirements;
    assertDefined(requirement, "the security requirement just counted");

    return this.requirement(requirement);
  }

  /**
   * The scheme and scopes one security requirement names.
   */
  private requirement(
    value: SimHttpApiOpenApiValue,
  ): SimHttpApiOpenApiSecurityRequirement {
    const requirement = value.object();
    const schemeNames = requirement.memberNames();

    if (schemeNames.length !== 1) {
      throw requirement.refusal(
        `names ${String(schemeNames.length)} security schemes, and a route ` +
          `has one authorizer, so only one scheme can be applied to it`,
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
