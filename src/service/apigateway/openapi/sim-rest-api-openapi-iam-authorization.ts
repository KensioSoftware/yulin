import type { SimRestApiOpenApiObject } from "./sim-rest-api-openapi-object.js";

/**
 * The one authorization `x-amazon-apigateway-auth` declares, which is the
 * extension a document writes IAM authorization on an operation with.
 */
const iamAuthorizationType = "AWS_IAM";

/**
 * Whether an operation asks for its method to be decided by IAM.
 *
 * The extension carries a type and nothing else, and `AWS_IAM` is all AWS
 * writes there. Anything else is refused rather than read as IAM
 * authorization, since a method decided by the wrong thing is worse than a
 * refused import.
 */
export function simRestApiOpenApiIamAuthorization(
  operation: SimRestApiOpenApiObject,
): boolean {
  const declared = operation
    .member("x-amazon-apigateway-auth")
    .optionalObject();

  if (declared === undefined) {
    return false;
  }

  const type = declared.member("type");
  const authorizationType = type.requiredString();

  if (authorizationType !== iamAuthorizationType) {
    throw type.refusal(
      `is '${authorizationType}', and ${iamAuthorizationType} is the one ` +
        `authorization x-amazon-apigateway-auth declares. An authorizer is ` +
        `named by a security requirement instead.`,
    );
  }

  return true;
}
