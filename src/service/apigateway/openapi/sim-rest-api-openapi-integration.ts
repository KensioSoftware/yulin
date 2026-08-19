import { simRestApiLambdaIntegrationHttpMethod } from "../api/method/sim-rest-api-integration.js";
import type { SimRestApiOpenApiObject } from "./sim-rest-api-openapi-object.js";
import type { SimRestApiOpenApiValue } from "./sim-rest-api-openapi-value.js";

/**
 * What one operation's integration says about the request it sends on.
 */
export interface SimRestApiOpenApiIntegrationInput {
  readonly type: string;
  readonly integrationHttpMethod: string;
  readonly uri: string;
}

/**
 * The integration members that configure something this simulation does not do
 * with a request, all deferred rather than dropped.
 *
 * A Lambda proxy integration hands the request to the function as it arrived
 * and sends the function's answer back as it was returned, so each of these
 * would change a request or a response here in a way nothing carries out.
 */
const deferredMembers = [
  "requestTemplates",
  "requestParameters",
  "responses",
  "passthroughBehavior",
  "contentHandling",
  "credentials",
  "timeoutInMillis",
  "cacheNamespace",
  "cacheKeyParameters",
  "connectionType",
  "connectionId",
  "tlsConfig",
];

const deferred =
  "configures something this simulation does not do with a request, so an " +
  "integration carrying it would behave differently here than on AWS";

/**
 * One `x-amazon-apigateway-integration` object, read into the part of the
 * PutIntegration input it decides.
 *
 * The values are handed to PutIntegration rather than checked here, so what an
 * integration URI may be and which types are simulated are stated in one
 * place. Only the translation is here: a document names an integration type in
 * lower case, and the command takes the upper case name the SDK uses.
 */
export class SimRestApiOpenApiIntegration {
  private readonly value: SimRestApiOpenApiValue;

  constructor(value: SimRestApiOpenApiValue) {
    this.value = value;
  }

  /**
   * The part of the PutIntegration input this integration asks for.
   */
  putIntegrationInput(): SimRestApiOpenApiIntegrationInput {
    const object = this.value.object();
    object.refuseMember(
      "$ref",
      "a reusable integration definition is an HTTP API feature, and a REST " +
        "API declares the integration on the operation itself",
    );
    object.refuseMembers(deferredMembers, deferred);

    return {
      type: object.member("type").requiredString().toUpperCase(),
      integrationHttpMethod: this.integrationHttpMethod(object),
      uri: object.member("uri").requiredString(),
    };
  }

  /**
   * The method API Gateway calls the integration with, refusing anything but
   * POST.
   *
   * An absent `httpMethod` is accepted, because API Gateway invokes a Lambda
   * proxy integration the one way whether or not the document says so. POST is
   * the method it calls Lambda's invoke API with rather than the method the
   * request arrived as, so anything else says the document meant something
   * else.
   */
  private integrationHttpMethod(object: SimRestApiOpenApiObject): string {
    const declared = object.member("httpMethod");
    const httpMethod = declared.optionalString();

    if (
      httpMethod !== undefined &&
      httpMethod !== simRestApiLambdaIntegrationHttpMethod
    ) {
      throw declared.refusal(
        `is '${httpMethod}', and a Lambda proxy integration is declared with ` +
          `POST, which is the method API Gateway calls Lambda with`,
      );
    }

    return simRestApiLambdaIntegrationHttpMethod;
  }
}
