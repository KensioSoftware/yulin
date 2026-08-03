import type { SimCreateIntegrationCommandInput } from "../command/integration/integration.command.js";
import type { SimHttpApiOpenApiObject } from "./sim-http-api-openapi-object.js";
import type { SimHttpApiOpenApiValue } from "./sim-http-api-openapi-value.js";

/**
 * The integration members that configure something this simulation does not do
 * with a request, all deferred rather than dropped.
 *
 * `integrationMethod` and `connectionType` are here for the same reason as the
 * rest: a Lambda proxy integration is invoked the one way, and a private
 * integration through a VPC link is not simulated at all.
 */
const deferredMembers = [
  "integrationMethod",
  "integrationSubtype",
  "requestParameters",
  "credentials",
  "tlsConfig",
  "responseTransferMode",
  "connectionId",
  "connectionType",
];

const deferred =
  "configures something this simulation does not do with a request, so an " +
  "integration carrying it would behave differently here than on AWS";

/**
 * One `x-amazon-apigateway-integration` object, read into the
 * CreateIntegration input it asks for.
 *
 * The values are handed to CreateIntegration rather than checked here, so what
 * an integration URI may be and which payload formats are simulated are stated
 * in one place. Only the translation is here: a document names an integration
 * type in lower case, and the command takes the upper case name the SDK uses.
 */
export class SimHttpApiOpenApiIntegration {
  private readonly value: SimHttpApiOpenApiValue;

  constructor(value: SimHttpApiOpenApiValue) {
    this.value = value;
  }

  /**
   * The CreateIntegration input this integration asks for.
   */
  createIntegrationInput(apiId: string): SimCreateIntegrationCommandInput {
    const object = this.value.object();
    object.refuseMembers(deferredMembers, deferred);
    // The type is read first, so an integration of a kind this simulation does
    // not create is refused as that rather than for how it was declared.
    const integrationType = this.integrationType(object);
    this.requireProxyHttpMethod(object);

    return {
      ApiId: apiId,
      IntegrationType: integrationType,
      IntegrationUri: object.member("uri").requiredString(),
      PayloadFormatVersion: object
        .member("payloadFormatVersion")
        .requiredString(),
    };
  }

  /**
   * The integration type, named as the command names it.
   *
   * `http_proxy` is refused here rather than passed on, so the refusal says
   * that forwarding a request to another endpoint is deferred rather than only
   * that a Lambda proxy is the one type simulated.
   */
  private integrationType(object: SimHttpApiOpenApiObject): string {
    const declared = object.member("type");

    if (declared.requiredString() === "http_proxy") {
      throw declared.refusal(
        "is an HTTP proxy integration, which forwards the request to another " +
          "endpoint. Only aws_proxy, a Lambda proxy integration, is simulated.",
      );
    }

    return declared.requiredString().toUpperCase();
  }

  /**
   * Refuse an integration declared with any method but POST.
   *
   * An absent `httpMethod` is accepted, because API Gateway invokes a Lambda
   * proxy integration the one way whether or not the document says so. POST is
   * the method it calls Lambda's invoke API with rather than the method the
   * route matches, so anything else says the document meant something else.
   */
  private requireProxyHttpMethod(object: SimHttpApiOpenApiObject): void {
    const declared = object.member("httpMethod");
    const httpMethod = declared.optionalString();

    if (httpMethod !== undefined && httpMethod !== "POST") {
      throw declared.refusal(
        `is '${httpMethod}', and a Lambda proxy integration is declared with ` +
          `POST, which is the method API Gateway calls Lambda with`,
      );
    }
  }
}
