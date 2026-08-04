/**
 * The user pool the pipeline's users sign in to, and the HTTP API they reach
 * it through.
 *
 * Every route is behind the pool, so the user id the functions work from is
 * one the API Gateway authorizer took out of a real token rather than one the
 * caller asked for.
 */

import {
  CreateApiCommand,
  CreateAuthorizerCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { AddPermissionCommand } from "@aws-sdk/client-lambda";
import { assertNonNullable } from "@kensio/smartass";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import type { MediaPipelineFunctions } from "./media-pipeline-functions.js";
import {
  publishRenditionFunctionName,
  requestUploadFunctionName,
  uploadStatusFunctionName,
} from "./media-pipeline-functions.js";
import {
  mediaApiName,
  mediaAppClientName,
  mediaUserPoolName,
} from "./media-pipeline-names.js";

/**
 * The user pool the API trusts tokens from.
 */
export interface MediaPipelineUserPool {
  readonly userPoolId: string;
  readonly clientId: string;
  readonly issuerUrl: string;
}

/**
 * The API, and the pool guarding it.
 */
export interface MediaPipelineApi extends MediaPipelineUserPool {
  readonly apiId: string;
  readonly apiEndpoint: string;
}

/**
 * Create the user pool and the app client the pipeline's clients sign in with.
 */
export async function createMediaPipelineUserPool(
  simAws: SimAws,
): Promise<MediaPipelineUserPool> {
  const cognito = simAws.cognitoIdentityProvider();

  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: mediaUserPoolName }),
  );
  const userPoolId = pool.UserPool?.Id;
  assertNonNullable(userPoolId, "CreateUserPool answered with a pool id");

  const appClient = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: mediaAppClientName,
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
    }),
  );
  const clientId = appClient.UserPoolClient?.ClientId;
  assertNonNullable(clientId, "CreateUserPoolClient answered with a client id");

  const issuerUrl = cognito.findUserPool(userPoolId)?.issuerUrl;
  assertNonNullable(issuerUrl, "The pool has an issuer URL");

  return { userPoolId, clientId, issuerUrl };
}

/**
 * Add a user to the pool with a password they can sign in with straight away.
 */
export async function createMediaPipelineUser(
  simAws: SimAws,
  pool: MediaPipelineUserPool,
  username: string,
  password: string,
): Promise<void> {
  const cognito = simAws.cognitoIdentityProvider();

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({
      UserPoolId: pool.userPoolId,
      Username: username,
    }),
  );
  await cognito.adminSetUserPassword(
    new AdminSetUserPasswordCommand({
      UserPoolId: pool.userPoolId,
      Username: username,
      Password: password,
      Permanent: true,
    }),
  );
}

interface MediaPipelineApiProperties {
  readonly simAws: SimAws;
  readonly pool: MediaPipelineUserPool;
  readonly functions: MediaPipelineFunctions;
}

/**
 * Create the HTTP API, its JWT authorizer, and a route per function.
 */
export async function createMediaPipelineApi(
  properties: MediaPipelineApiProperties,
): Promise<MediaPipelineApi> {
  const { simAws, pool, functions } = properties;
  const apiGateway = simAws.apiGatewayV2();

  const created = await apiGateway.createApi(
    new CreateApiCommand({ Name: mediaApiName, ProtocolType: "HTTP" }),
  );
  assertNonNullable(created.ApiId, "CreateApi answered with an API id");
  assertNonNullable(created.ApiEndpoint, "CreateApi answered with an endpoint");
  const apiId = created.ApiId;

  const authorizer = await apiGateway.createAuthorizer(
    new CreateAuthorizerCommand({
      ApiId: apiId,
      Name: "user-pool-authorizer",
      AuthorizerType: "JWT",
      IdentitySource: ["$request.header.Authorization"],
      JwtConfiguration: {
        Issuer: pool.issuerUrl,
        Audience: [pool.clientId],
      },
    }),
  );
  assertNonNullable(
    authorizer.AuthorizerId,
    "CreateAuthorizer answered with an authorizer id",
  );

  const routes: readonly [string, string, string][] = [
    ["POST /uploads", functions.requestUploadArn, requestUploadFunctionName],
    [
      "GET /uploads/{uploadId}",
      functions.uploadStatusArn,
      uploadStatusFunctionName,
    ],
    [
      "POST /uploads/{uploadId}/published",
      functions.publishRenditionArn,
      publishRenditionFunctionName,
    ],
  ];

  for (const [routeKey, functionArn, functionName] of routes) {
    // eslint-disable-next-line no-await-in-loop -- routes are created one at a time so a failure names the route that failed.
    await createRoute({
      simAws,
      apiId,
      authorizerId: authorizer.AuthorizerId,
      routeKey,
      functionArn,
      functionName,
    });
  }

  await apiGateway.createStage(
    new CreateStageCommand({
      ApiId: apiId,
      StageName: "$default",
      AutoDeploy: true,
    }),
  );

  return { ...pool, apiId, apiEndpoint: created.ApiEndpoint };
}

interface RouteProperties {
  readonly simAws: SimAws;
  readonly apiId: string;
  readonly authorizerId: string;
  readonly routeKey: string;
  readonly functionArn: string;
  readonly functionName: string;
}

/**
 * Create one authorized route proxying to one function, and allow the API to
 * invoke it.
 */
async function createRoute(properties: RouteProperties): Promise<void> {
  const { simAws, apiId } = properties;
  const apiGateway = simAws.apiGatewayV2();

  const integration = await apiGateway.createIntegration(
    new CreateIntegrationCommand({
      ApiId: apiId,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: properties.functionArn,
      PayloadFormatVersion: "2.0",
    }),
  );
  assertNonNullable(
    integration.IntegrationId,
    "CreateIntegration answered with an integration id",
  );

  await apiGateway.createRoute(
    new CreateRouteCommand({
      ApiId: apiId,
      RouteKey: properties.routeKey,
      Target: `integrations/${integration.IntegrationId}`,
      AuthorizationType: "JWT",
      AuthorizerId: properties.authorizerId,
    }),
  );

  await simAws.lambda().addPermission(
    new AddPermissionCommand({
      FunctionName: properties.functionName,
      StatementId: "AllowApiGatewayInvoke",
      Action: "lambda:InvokeFunction",
      Principal: "apigateway.amazonaws.com",
      SourceArn: `arn:aws:execute-api:${simAws.defaultRegionName}:${simAws.defaultAccountId}:${apiId}/*/*`,
    }),
  );
}
