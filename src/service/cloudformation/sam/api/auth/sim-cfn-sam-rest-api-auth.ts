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
import { samRestCognitoAuthorizer } from "./sim-cfn-sam-rest-cognito-authorizer.js";
import { samRestLambdaAuthorizer } from "./sim-cfn-sam-rest-lambda-authorizer.js";

/**
 * The SAM Resource type a REST API `Auth` block is declared on.
 */
const resourceType = "AWS::Serverless::Api";

/**
 * The `Auth` properties this expansion reads on a REST API. Everything else
 * SAM has there is refused by name.
 */
const supportedProperties = new Set(["Authorizers", "DefaultAuthorizer"]);

/**
 * The `Auth` of one AWS::Serverless::Api, as the authorizer Resources it
 * declares and the default every method takes.
 *
 * SAM writes these into the Swagger document it generates. They are written as
 * `AWS::ApiGateway::Authorizer` Resources here, the way the methods beside them
 * are written as Resources, so an authorizer is something a Stack holds,
 * answers `Ref` for and tears down.
 *
 * `AWS_IAM` is an authorizer of every REST API without being declared, since a
 * SAM template names it as a `DefaultAuthorizer` without declaring one.
 */
export function samRestApiAuth(
  logicalId: string,
  apiProperties: SimCfnTemplateValueRecord,
): SamApiAuth {
  const api: SamApiAuthApi = { resourceType, logicalId };
  const auth = samApiAuthBlock(api, apiProperties, supportedProperties);

  return {
    api,
    authorizers: new Map([
      [samIamAuthorizerName, samIamAuthorizer()],
      ...samApiAuthorizerDefinitions(api, auth).map(
        ([name, definition]) =>
          [name, restAuthorizer({ api, name, definition })] as const,
      ),
    ]),
    defaultAuthorizer: samApiDefaultAuthorizer(api, auth),
  };
}

/**
 * One authorizer of a REST API, as the Resource it becomes and what a method
 * naming it carries.
 *
 * A Cognito authorizer is the one that names a `UserPoolArn`, and a Lambda one
 * the one that names a `FunctionArn`. That is how SAM tells them apart, and an
 * authorizer naming neither is refused rather than deployed as something it
 * did not ask to be.
 */
function restAuthorizer(authorizer: SamAuthorizerDefinition): SamApiAuthorizer {
  const userPoolArn = authorizer.definition["UserPoolArn"];

  if (userPoolArn !== undefined) {
    return samRestCognitoAuthorizer(authorizer, userPoolArn);
  }

  const functionArn = authorizer.definition["FunctionArn"];

  if (functionArn !== undefined) {
    return samRestLambdaAuthorizer(authorizer, functionArn);
  }

  throw samAuthError(
    authorizer.api,
    `Auth.Authorizers.${authorizer.name}`,
    "it names neither a UserPoolArn nor a FunctionArn, so there is no " +
      "telling what would decide a request",
  );
}
