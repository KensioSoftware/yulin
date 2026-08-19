import type { SimRestApiOpenApiPointer } from "./sim-rest-api-openapi-pointer.js";
import type { SimRestApiOpenApiValue } from "./sim-rest-api-openapi-value.js";

/**
 * The operation members that decide who may call the method, none of which is
 * read out of a document yet.
 */
const refusedOperationMembers: readonly (readonly [string, string])[] = [
  [
    "security",
    "a security requirement names the authorizer in front of the method, and " +
      "reading an authorizer out of a document is not simulated. Every " +
      "imported method is declared with AuthorizationType NONE. Create the " +
      "authorizer with CreateAuthorizer and declare the method against it.",
  ],
  [
    "x-amazon-apigateway-auth",
    "it declares IAM authorization on the method, and AWS_IAM is not a " +
      "simulated authorization type",
  ],
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
 * One operation of the document being imported: the method it becomes and the
 * integration behind it.
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
}
