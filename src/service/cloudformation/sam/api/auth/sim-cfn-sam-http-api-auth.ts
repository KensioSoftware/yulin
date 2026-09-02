import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import {
  samApiAuthBlock,
  samAuthError,
  samIamAuthorizer,
} from "./sim-cfn-sam-api-auth.js";
import {
  samApiAuthorizerDefinitions,
  samApiDefaultAuthorizer,
} from "./sim-cfn-sam-api-authorizers.js";
import type {
  SamApiAuth,
  SamApiAuthApi,
  SamApiAuthorizer,
} from "./sim-cfn-sam-api-auth.types.js";
import { samIamAuthorizerName } from "./sim-cfn-sam-api-auth.types.js";
import type { SamAuthorizerDefinition } from "./sim-cfn-sam-authorizer-definition.js";
import { samHttpJwtAuthorizer } from "./sim-cfn-sam-http-jwt-authorizer.js";
import { samHttpLambdaAuthorizer } from "./sim-cfn-sam-http-lambda-authorizer.js";

/**
 * The SAM Resource type an HTTP API `Auth` block is declared on.
 */
const resourceType = "AWS::Serverless::HttpApi";

/**
 * The `Auth` properties this expansion reads on an HTTP API. Everything else
 * SAM has there is refused by name.
 */
const supportedProperties = new Set([
  "Authorizers",
  "DefaultAuthorizer",
  "EnableIamAuthorizer",
]);

/**
 * The `Auth` of one AWS::Serverless::HttpApi, as the authorizer Resources it
 * declares and the default every route takes.
 *
 * SAM writes these into the OpenAPI document it generates. They are written as
 * `AWS::ApiGatewayV2::Authorizer` Resources here, the way the routes beside
 * them are written as Resources.
 *
 * `AWS_IAM` is an authorizer of an HTTP API only once `EnableIamAuthorizer`
 * asks for it, which is the rule real SAM applies. A REST API has it either
 * way.
 */
export function samHttpApiAuth(
  logicalId: string,
  apiProperties: SimCfnTemplateValueRecord,
): SamApiAuth {
  const api: SamApiAuthApi = { resourceType, logicalId };
  const auth = samApiAuthBlock(api, apiProperties, supportedProperties);
  const iam =
    auth["EnableIamAuthorizer"] === true
      ? ([[samIamAuthorizerName, samIamAuthorizer()]] as const)
      : [];

  return {
    api,
    authorizers: new Map([
      ...iam,
      ...samApiAuthorizerDefinitions(api, auth).map(
        ([name, definition]) =>
          [name, httpAuthorizer({ api, name, definition })] as const,
      ),
    ]),
    defaultAuthorizer: samApiDefaultAuthorizer(api, auth),
  };
}

/**
 * One authorizer of an HTTP API, as the Resource it becomes and what a route
 * naming it carries.
 *
 * An authorizer naming a `JwtConfiguration` verifies tokens itself, and one
 * naming a `FunctionArn` asks a function of the template. An authorizer naming
 * neither is refused rather than deployed as something it did not ask to be.
 */
function httpAuthorizer(authorizer: SamAuthorizerDefinition): SamApiAuthorizer {
  const jwtConfiguration = authorizer.definition["JwtConfiguration"];

  if (jwtConfiguration !== undefined) {
    return samHttpJwtAuthorizer(authorizer, jwtConfiguration);
  }

  const functionArn = authorizer.definition["FunctionArn"];

  if (functionArn !== undefined) {
    return samHttpLambdaAuthorizer(authorizer, functionArn);
  }

  throw samAuthError(
    authorizer.api,
    `Auth.Authorizers.${authorizer.name}`,
    "it names neither a JwtConfiguration nor a FunctionArn, so there is no " +
      "telling what would decide a request",
  );
}
