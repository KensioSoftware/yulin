import { SimHttpApiOpenApiIntegration } from "./sim-http-api-openapi-integration.js";
import { simHttpApiOpenApiUnescapeToken } from "./sim-http-api-openapi-pointer.js";
import type { SimHttpApiOpenApiValue } from "./sim-http-api-openapi-value.js";

/**
 * The one reference form an imported document may use.
 *
 * The schemas under `responses`, `requestBody` and `components.schemas` are
 * ignored rather than read, so no reference into them ever has to resolve.
 * That leaves the reusable integration definitions as the only place a `$ref`
 * points somewhere this simulation looks.
 */
const integrationsPrefix = "#/components/x-amazon-apigateway-integrations/";

/**
 * Where the integration behind one operation came from.
 */
export interface SimHttpApiOpenApiIntegrationSource {
  /**
   * The name of the reusable definition, or undefined when the operation
   * declared the integration inline.
   */
  readonly name: string | undefined;
  readonly integration: SimHttpApiOpenApiIntegration;
}

interface SimHttpApiOpenApiIntegrationReferencesProperties {
  readonly definitions: SimHttpApiOpenApiValue;
}

/**
 * Resolves an operation's integration, whether it is written inline or as a
 * reference into `components.x-amazon-apigateway-integrations`.
 *
 * A referenced definition is created once and shared by every operation naming
 * it, which is how a reusable definition reads and what CDK's own
 * deduplication does. Whether real API Gateway shares one integration or
 * creates one per use is not established, and the difference is the count
 * `GetIntegrations` answers with.
 */
export class SimHttpApiOpenApiIntegrationReferences {
  private readonly definitions: SimHttpApiOpenApiValue;
  private readonly created = new Map<string, string>();

  constructor(properties: SimHttpApiOpenApiIntegrationReferencesProperties) {
    this.definitions = properties.definitions;
  }

  /**
   * The integration an operation's `x-amazon-apigateway-integration` names.
   */
  resolve(value: SimHttpApiOpenApiValue): SimHttpApiOpenApiIntegrationSource {
    const object = value.object();
    const reference = object.member("$ref").optionalString();

    if (reference === undefined) {
      return {
        name: undefined,
        integration: new SimHttpApiOpenApiIntegration(value),
      };
    }

    const name = this.referencedName(value, reference);

    return {
      name,
      integration: new SimHttpApiOpenApiIntegration(
        this.definition(value, name),
      ),
    };
  }

  /**
   * The integration already created for a reusable definition, if one was.
   */
  createdId(name: string | undefined): string | undefined {
    if (name === undefined) {
      return undefined;
    }

    return this.created.get(name);
  }

  /**
   * Remember the integration created for a reusable definition, so the next
   * operation naming it shares that one.
   */
  remember(name: string | undefined, integrationId: string): void {
    if (name === undefined) {
      return;
    }

    this.created.set(name, integrationId);
  }

  /**
   * The definition name a `$ref` points at, refusing a reference anywhere else.
   */
  private referencedName(
    value: SimHttpApiOpenApiValue,
    reference: string,
  ): string {
    const name = reference.slice(integrationsPrefix.length);

    if (!reference.startsWith(integrationsPrefix) || name.includes("/")) {
      throw value
        .object()
        .member("$ref")
        .refusal(
          `points at '${reference}', and the only reference resolved is a ` +
            `single-level one into ${integrationsPrefix}`,
        );
    }

    return simHttpApiOpenApiUnescapeToken(name);
  }

  /**
   * The reusable definition under a name, refusing a reference to one the
   * document does not carry.
   */
  private definition(
    value: SimHttpApiOpenApiValue,
    name: string,
  ): SimHttpApiOpenApiValue {
    const definitions = this.definitions.optionalObject();

    if (definitions?.has(name) !== true) {
      throw value
        .object()
        .member("$ref")
        .refusal(
          `names the integration definition '${name}', which ` +
            `${this.definitions.pointer.toString()} does not carry`,
        );
    }

    return definitions.member(name);
  }
}
