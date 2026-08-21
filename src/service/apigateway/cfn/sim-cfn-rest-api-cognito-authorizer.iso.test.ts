import {
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployRestApi,
  simAwsInEuWest2,
} from "../../../../test/apigateway/cfn-deploy.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimAws } from "../../aws/sim-aws.js";
import {
  type SimCognitoSignedIn,
  simCognitoSignedInFactory,
} from "../../cognito/user-pool/auth/sim-cognito-signed-in.factory.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRestApi } from "../api/sim-rest-api.js";
import { simCfnRestApiTemplateFactory } from "./sim-cfn-rest-api-template.factory.js";

/**
 * The scope a Cognito sign-in through the user pool API puts in a token.
 */
const adminScope = "aws.cognito.signin.user.admin";

/**
 * A handler reporting the claims the authorizer accepted.
 */
const claimsHandlerSource = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(event.requestContext.authorizer),
});
`;

/**
 * The template that deploys a REST API gated by a Cognito authorizer.
 *
 * The pool is created before the stack rather than deployed with it, so the
 * template is about the authorizer alone. A stack declaring its own
 * `AWS::Cognito::UserPool` reaches the same authorizer through a `Fn::GetAtt`
 * on its ARN.
 */
function gatedTemplate(
  userPoolArn: string,
  methodProperties: SimCfnTemplateValueRecord = {},
): ReturnType<typeof simCfnRestApiTemplateFactory.make> {
  return simCfnRestApiTemplateFactory.make({
    handlerSource: claimsHandlerSource,
    methods: [{ httpMethod: "GET", path: ["orders"] }],
    methodProperties: {
      AuthorizationType: "COGNITO_USER_POOLS",
      AuthorizerId: { Ref: "Authorizer" },
      ...methodProperties,
    },
    resources: {
      Authorizer: {
        Type: "AWS::ApiGateway::Authorizer",
        Properties: {
          RestApiId: { Ref: "Api" },
          Name: "user-pools",
          Type: "COGNITO_USER_POOLS",
          IdentitySource: "method.request.header.Authorization",
          ProviderARNs: [userPoolArn],
        },
      },
    },
  });
}

/**
 * Deploy that template against a pool with a signed-in user, and answer what
 * a test needs to call the deployed method.
 */
async function deployGatedApi(
  methodProperties: SimCfnTemplateValueRecord = {},
): Promise<{
  readonly simAws: SimAws;
  readonly url: string;
  readonly signedIn: SimCognitoSignedIn;
}> {
  const simAws = simAwsInEuWest2();
  const signedIn = await simCognitoSignedInFactory.make({}, simAws);
  const stack = await deployRestApi(
    simAws,
    gatedTemplate(signedIn.userPoolArn, methodProperties),
  );
  const restApi = stack.getResource("Api")?.simResource as
    | SimRestApi
    | undefined;
  assertNonNullable(restApi);

  return {
    simAws,
    url: new SimAwsLocalUrl({
      input: `${restApi.invokeUrl("prod")}/orders`,
    }).toString(),
    signedIn,
  };
}

describe("Deploying a REST API Cognito authorizer from CloudFormation", () => {
  it("gates a method with the user pool the template names", async () => {
    // Given a deployed API whose method names a COGNITO_USER_POOLS authorizer
    const { simAws, url, signedIn } = await deployGatedApi();

    // When the method is requested with and without a token that pool issued
    const http = new SimAwsHttp({ simAws });
    const admitted = await http.fetch(url, {
      headers: { authorization: signedIn.accessToken },
    });
    const refused = await http.fetch(url);

    // Then the deployed authorizer decides both, and the token's claims reach
    // the handler
    assertIdentical(admitted.status, 200);
    assertIdentical(refused.status, 401);
    assertObjectMatches(await admitted.json(), {
      claims: { iss: signedIn.issuerUrl, username: signedIn.username },
    });
  });

  it("refuses a token that does not meet the scopes the template asks for", async () => {
    // Given a deployed method asking for a scope no simulated flow issues
    const { simAws, url, signedIn } = await deployGatedApi({
      AuthorizationScopes: ["orders.write"],
    });

    // When an otherwise acceptable token is presented
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { authorization: signedIn.accessToken },
    });

    // Then the deployed scopes decided it, with the 403 an accepted token
    // that allows nothing here gets
    assertIdentical(response.status, 403);
  });

  it("serves a method whose deployed scope the token claims", async () => {
    // Given a deployed method asking for the scope a pool sign-in issues
    const { simAws, url, signedIn } = await deployGatedApi({
      AuthorizationScopes: [adminScope],
    });

    // When an access token carrying that scope is presented
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { authorization: signedIn.accessToken },
    });

    // Then the method is reached, because one method scope matched
    assertIdentical(response.status, 200);
  });
});
