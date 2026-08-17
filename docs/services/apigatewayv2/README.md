# Simulated API Gateway HTTP APIs

Yulin includes a simulated API Gateway v2 service, reachable as `simAws.apiGatewayV2()`. It covers
HTTP APIs with a Lambda proxy integration. A handler that runs behind an HTTP API can be tested
against a real HTTP request, with no hand-built event to keep in step.

This is HTTP APIs only. WebSocket APIs and REST APIs (the older API Gateway v1 service, on a
separate SDK client) are outside it.

## Creating an API

`CreateApiCommand` creates an HTTP API and returns the endpoint API Gateway generates for it.

```typescript sim-apigatewayv2-create-api
/**
 * Creating a simulated API Gateway HTTP API.
 */

import { CreateApiCommand, GetApiCommand } from "@aws-sdk/client-apigatewayv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const apiGateway = simAws
  .account("555555555555")
  .region("eu-west-1")
  .apiGatewayV2();

const created = await apiGateway.createApi(
  new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
);

console.log(created.ApiId);
console.log(created.ApiEndpoint);

const fetched = await apiGateway.getApi(
  new GetApiCommand({ ApiId: created.ApiId }),
);

console.log(fetched.Name);
```

The endpoint names the API id and the region, as a real one does:

```text
https://a1b2c3d4e5.execute-api.eu-west-1.amazonaws.com
```

A name is a label here, as it is on real AWS. Two APIs in one Account and Region may share a name,
and only the id tells them apart.

## Routing requests to a Lambda function

An API needs three more resources before it serves anything. Those are an integration naming the
function, a route pointing at that integration, and a stage to serve it from. The function also has to allow API
Gateway to invoke it. That grant is a permission on the function, not on the API. See
[Granting the API permission to invoke the function](#granting-the-api-permission-to-invoke-the-function).
Once all of that exists, `serveSimAws` answers requests to the generated endpoint by invoking the
function.

Pass the API endpoint through `srv.localUrl(...)`. It keeps the endpoint's hostname and sends the
request to the local server, the way it adapts simulated S3 website and Lambda Function URL
endpoints.

```typescript sim-apigatewayv2-lambda-proxy
/**
 * Serving a simulated HTTP API that proxies to a simulated Lambda function.
 */

import {
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import type { SimPayload2Event } from "@kensio/yulin/apigatewayv2";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const { FunctionArn } = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimPayload2Event) => ({
        statusCode: 200,
        headers: { "content-type": "text/plain" },
        body: `orders limit ${event.queryStringParameters?.["limit"] ?? "none"}`,
      })),
    },
  }),
);

const apiGateway = simAws.apiGatewayV2();

const { ApiId, ApiEndpoint } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
);

const { IntegrationId } = await apiGateway.createIntegration(
  new CreateIntegrationCommand({
    ApiId,
    IntegrationType: "AWS_PROXY",
    IntegrationUri: FunctionArn,
    PayloadFormatVersion: "2.0",
  }),
);

await apiGateway.createRoute(
  new CreateRouteCommand({
    ApiId,
    RouteKey: "$default",
    Target: `integrations/${IntegrationId}`,
  }),
);

await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "$default", AutoDeploy: true }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "orders",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`,
  }),
);

const srv = await serveSimAws({ simAws });

const response = await fetch(srv.localUrl(`${ApiEndpoint}/orders?limit=10`));

console.log(response.status);
console.log(await response.text());

await srv.close();
```

The `$default` route matches any method and path. Every request to the endpoint reaches the
function. The integration URI is the function's ARN, and the function may be in another Account or
Region. It is looked up where its ARN says it is.

## Granting the API permission to invoke the function

A Lambda proxy integration works once the function's resource policy allows
`apigateway.amazonaws.com` to invoke it. The console adds that permission for you. An integration
created through CloudFormation, the CLI or an SDK leaves it to you. That is what
`AddPermissionCommand` in the example above does. Without it the request is answered with a 500 and
`{"message":"Internal Server Error"}`, and the handler never runs. CDK's `HttpLambdaIntegration`
emits the same grant as an `AWS::Lambda::Permission`.

Each request is authorized as `lambda:InvokeFunction` on the function ARN, with the caller being the
service principal `apigateway.amazonaws.com`. The function's own resource policy is the whole
decision. A service principal has no identity policies of its own. The route that matched is supplied
as `AWS:SourceArn`. A permission may be granted for one route and withheld from another:

```text
arn:aws:execute-api:<region>:<account>:<apiId>/<stage>/<METHOD>/<route path>
```

- The Account and Region are the API's, not the function's.
- The stage is the one that served the request, so `$default` for the default stage.
- The method is the request's own. A `GET` reaching a route keyed `ANY /orders` gives `GET`.
- The path is the matched route key's template with its parameter braces intact. A request to
  `/orders/42` on the route `GET /orders/{orderId}` gives `orders/{orderId}`. A `SourceArn` is
  written against route keys, and IAM treats a brace as an ordinary character.
- The `$default` route has no method and no path of its own, so both collapse into one `$default`
  segment: `<apiId>/<stage>/$default`.

A `SourceArn` may wildcard any part of that, and the usual grant does. `<apiId>/*/*` allows every
route of the API on every stage.

The API's own Account is supplied as `AWS:SourceAccount`. A permission carrying a `SourceAccount`
matches when it names the Account the API belongs to. That is the Account the source ARN names, not
the one owning the function, and the difference shows up on an integration reaching across Accounts.
CDK writes both keys for some grants, and a permission carrying either or both is evaluated on what
it says.

`AWS:SourceArn` and `AWS:SourceAccount` are the only condition keys supplied here. A permission that
also carries `PrincipalOrgID` or `InvokedViaFunctionUrl` never matches, since those keys have no
value at request time. The request is refused with the same 500.

AWS documents neither the method nor the path as the value API Gateway supplies. Both are inferred
from the permission patterns AWS and CDK write. The code that builds the ARN records that.

## Route keys

A route key is either the literal `$default` or an upper-case HTTP method and a path separated by one
space:

```text
GET /pets
GET /pets/{petId}
ANY /admin/{proxy+}
$default
```

The method is one of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` or `ANY`, where `ANY`
matches whatever method the request used.

A path is made of three kinds of segment:

- A literal, such as `pets`, matching that one segment.
- A parameter, such as `{petId}`, matching exactly one segment, whatever is in it.
- A greedy parameter, such as `{proxy+}`, matching everything left of the path. It is only ever the
  last segment, and it needs at least one segment to match, so `GET /pets/{proxy+}` matches
  `/pets/cat/1` but not `/pets`.

A route key that cannot be read is refused by `CreateRoute` with a `BadRequestException`, the same
place real API Gateway refuses it. That covers a lower-case method, an unbalanced brace, and a greedy
parameter anywhere but the end.

A parameter name falls outside a route's identity, so `GET /pets/{id}` and `GET /pets/{petId}` are
the same route key, and creating the second gives a `ConflictException`.

One path may not name the same parameter twice, so `GET /pets/{id}/toys/{id}` is refused. A handler
reads path parameters off one object, and only one of the two captures could arrive. Whether real API
Gateway refuses it too is unestablished. This is stricter than AWS is known to be.

## Which route serves a request

More than one route may match a request, and the most specific one takes it. In order:

1. A route matching the whole path beats a route ending in a greedy parameter, which beats
   `$default`.
2. An exact method beats `ANY`.
3. The path decides, segment by segment from the left, with a literal beating a `{name}` parameter
   and a `{name}` beating a `{name+}`. Comparing left to right is also what makes the longest literal
   prefix win between two greedy routes, so `GET /pets/dog/{proxy+}` takes `/pets/dog/collars/1`
   ahead of `GET /pets/{proxy+}`.

AWS's worked example, encoded as a test here:

| Request           | Route selected       |
| ----------------- | -------------------- |
| `GET /pets/dog/1` | `GET /pets/dog/1`    |
| `GET /pets/dog/2` | `GET /pets/dog/{id}` |
| `GET /pets/cat/1` | `GET /pets/{proxy+}` |
| `POST /test/5`    | `ANY /{proxy+}`      |

from the routes `GET /pets/dog/1`, `GET /pets/dog/{id}`, `GET /pets/{proxy+}`, `ANY /{proxy+}` and
`$default`.

Rule 1 is documented by AWS, as is the literal-beating-parameter part of rule 3. Three things here
are observed rather than documented. They are rule 2, the longest-literal-prefix part of rule 3, and
the placement of the method comparison above the path comparison. Each is marked in the code next to the
rule it governs.

A request whose path matches a route with a different method matches no route at all. An API with no
`ANY` route, no greedy route and no `$default` route to catch it answers 404, not 405.

## Path parameters and named stages

What a route captured reaches the handler as `event.pathParameters`. A named stage is served under
its own path segment. Stage selection runs before route selection, and the routes never see the stage
name.

```typescript sim-apigatewayv2-routes
/**
 * Matching a simulated HTTP API request by route key, path parameter and stage.
 */

import {
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import type { SimPayload2Event } from "@kensio/yulin/apigatewayv2";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const { FunctionArn } = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "pets",
    Role: "arn:aws:iam::111111111111:role/PetsRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimPayload2Event) => ({
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          routeKey: event.routeKey,
          rawPath: event.rawPath,
          stage: event.requestContext.stage,
          petId: event.pathParameters?.["petId"],
        }),
      })),
    },
  }),
);

const apiGateway = simAws.apiGatewayV2();

const { ApiId, ApiEndpoint } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "pets", ProtocolType: "HTTP" }),
);

const { IntegrationId } = await apiGateway.createIntegration(
  new CreateIntegrationCommand({
    ApiId,
    IntegrationType: "AWS_PROXY",
    IntegrationUri: FunctionArn,
    PayloadFormatVersion: "2.0",
  }),
);

for (const RouteKey of [
  "GET /pets",
  "GET /pets/{petId}",
  "ANY /admin/{proxy+}",
  "$default",
]) {
  await apiGateway.createRoute(
    new CreateRouteCommand({
      ApiId,
      RouteKey,
      Target: `integrations/${IntegrationId}`,
    }),
  );
}

await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "dev", AutoDeploy: true }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "pets",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`,
  }),
);

const srv = await serveSimAws({ simAws });

const response = await fetch(srv.localUrl(`${ApiEndpoint}/dev/pets/6`));

console.log(await response.json());

await srv.close();
```

That handler reports four fields of its event. The response body it produces is:

```json
{
  "routeKey": "GET /pets/{petId}",
  "rawPath": "/dev/pets/6",
  "stage": "dev",
  "petId": "6"
}
```

`rawPath` and `requestContext.http.path` keep the stage segment. `routeKey` and `pathParameters` come
from the path the routes matched, `/pets/6`. The stage prefix in the path is corroborated by the
documented `$context.path` access log variable ("the request path, for example
`/{stage}/root/child`"). The payload format page says nothing about it.

A stage name is `$default`, or up to 128 alphanumerics, hyphens and underscores. The `$default` stage
is served at the root of the endpoint, and a named stage under its own segment. Both kinds can exist
on one API at once. An explicit stage match wins over any route match. With a `$default` stage and a
stage named `pets`, a request for `/pets/dog` is served by the stage `pets` on the route path `/dog`.
A request reaching an API with no stage for it, and no `$default` stage, is a 404.

`pathParameters` is left out of the event entirely when the matched route captured nothing, including
on a `$default` match. `StageVariables` set on the stage arrive as `event.stageVariables`, and are
left out the same way when the stage has none.

## Protecting a route with a Cognito user pool

A JWT authorizer verifies a signed token before the integration is invoked. `CreateAuthorizerCommand`
creates one, and a route asks for it with `AuthorizationType: "JWT"` and the authorizer's id.

The issuer is a URL. Point it at a [simulated Cognito user pool](../cognito/ "Simulated Cognito docs")
and the pool's own signing key verifies the token. A token from `InitiateAuthCommand` or
`AdminInitiateAuthCommand` reaches the route, and anything else is turned away. The audience is the
app client ids the authorizer admits.

```typescript sim-apigatewayv2-jwt-authorizer
/**
 * Protecting a simulated HTTP API route with a Cognito user pool.
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
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import type { SimPayload2Event } from "@kensio/yulin/apigatewayv2";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const UserPoolId = pool.UserPool!.Id!;

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
  }),
);
const ClientId = appClient.UserPoolClient!.ClientId!;

await cognito.adminCreateUser(
  new AdminCreateUserCommand({ UserPoolId, Username: "ada" }),
);
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId,
    Username: "ada",
    Password: "Correct-horse-1",
    Permanent: true,
  }),
);

const { FunctionArn } = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimPayload2Event) => ({
        statusCode: 200,
        headers: { "content-type": "text/plain" },
        body: `orders for ${
          event.requestContext.authorizer?.jwt?.claims["username"] ?? "nobody"
        }`,
      })),
    },
  }),
);

const apiGateway = simAws.apiGatewayV2();

const { ApiId, ApiEndpoint } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
);

const { IntegrationId } = await apiGateway.createIntegration(
  new CreateIntegrationCommand({
    ApiId,
    IntegrationType: "AWS_PROXY",
    IntegrationUri: FunctionArn,
    PayloadFormatVersion: "2.0",
  }),
);

const { AuthorizerId } = await apiGateway.createAuthorizer(
  new CreateAuthorizerCommand({
    ApiId,
    Name: "pool-authorizer",
    AuthorizerType: "JWT",
    IdentitySource: ["$request.header.Authorization"],
    JwtConfiguration: {
      Issuer: `https://cognito-idp.us-east-1.amazonaws.com/${UserPoolId}`,
      Audience: [ClientId],
    },
  }),
);

await apiGateway.createRoute(
  new CreateRouteCommand({
    ApiId,
    RouteKey: "GET /orders",
    Target: `integrations/${IntegrationId}`,
    AuthorizationType: "JWT",
    AuthorizerId,
  }),
);

await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "$default", AutoDeploy: true }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "orders",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`,
  }),
);

const signedIn = await cognito.adminInitiateAuth(
  new AdminInitiateAuthCommand({
    UserPoolId,
    ClientId,
    AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "ada", PASSWORD: "Correct-horse-1" },
  }),
);
const accessToken = signedIn.AuthenticationResult!.AccessToken!;

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${ApiEndpoint}/orders`);

const anonymous = await fetch(url);

console.log(anonymous.status); // 401
console.log(anonymous.headers.get("www-authenticate")); // "Bearer"

const authorized = await fetch(url, {
  headers: { authorization: `Bearer ${accessToken}` },
});

console.log(await authorized.text()); // "orders for ada"

// Advancing the simulation's clock past the token's expiry closes the route
// to the same token, with nothing reissued.
await simAws.clock().advanceBy({ hours: 2 });

const expired = await fetch(url, {
  headers: { authorization: `Bearer ${accessToken}` },
});

console.log(expired.status); // 401

await srv.close();
```

The verification is real. The token is parsed, its `alg` has to be `RS256`, its `kid` has to name a
key the issuer publishes, and the signature is checked against that key with `node:crypto`. The whole
check runs in process, with no network fetch and no verification library.

### What a refused request gets back

A token that is missing, unreadable, signed with an unsupported algorithm, signed by an unknown key,
or carrying a claim that fails is answered with a 401, `{"message":"Unauthorized"}` and a
`www-authenticate: Bearer` header. The integration is never invoked. Which check failed stays
undisclosed, here and on real API Gateway. A mismatched audience is the exception. That one carries
`error_description="the token does not have a valid audience"`, the one description AWS publishes.

The claims are checked in the order AWS documents. The issuer comes first, then the audience, then
`exp`, `nbf` and `iat`. There is no allowance for clock skew, and every timestamp comes from the simulation's
clock. `simAws.clock().advanceBy(...)` expires a token that was accepted a moment before.

### Identity source

`IdentitySource` takes one entry, either `$request.header.<name>` or `$request.querystring.<name>`. A
`Bearer` prefix on the value, followed by whitespace, is stripped case-insensitively and is optional.
Anything else is refused by `CreateAuthorizer`. An authorizer looking for the token where no client
puts it refuses every request, for a reason that reads like a signing problem.

### Route scopes, and access tokens versus ID tokens

`AuthorizationScopes` on a route is checked against the token's `scope` claim, split on whitespace.
The check is any-of, so one matching scope is enough. A verified token matching none of them is
answered with a 403 and `{"message":"Forbidden"}`.

```typescript
await apiGateway.createRoute(
  new CreateRouteCommand({
    ApiId,
    RouteKey: "GET /orders",
    Target: `integrations/${IntegrationId}`,
    AuthorizationType: "JWT",
    AuthorizerId,
    AuthorizationScopes: ["aws.cognito.signin.user.admin"],
  }),
);
```

An ID token passes an authorizer that configures only an audience. `token_use` goes unchecked here, as
it does on real API Gateway. An ID token's `aud` is the app client id, and matches. AWS documents this
and recommends route scopes as the way to tell the two apart. A Cognito ID token has no `scope` claim
at all, so any route scope refuses it.

Sign-in through the user pool API issues one scope, `aws.cognito.signin.user.admin`, and that is the
only scope a simulated flow can put in a token. Resource servers, custom scopes and the client
credentials grant are outside the simulation. No other route scope is satisfiable.

### The claims the handler receives

An accepted token arrives as `event.requestContext.authorizer.jwt`:

```json
{
  "claims": {
    "sub": "0a1b2c3d-...",
    "iss": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc123",
    "client_id": "1h57kf5cpparf3m47el34md5m9",
    "token_use": "access",
    "scope": "aws.cognito.signin.user.admin",
    "username": "ada",
    "cognito:groups": "[Admins Readers]",
    "exp": "1785675600"
  },
  "scopes": ["aws.cognito.signin.user.admin"]
}
```

Every claim value is a string, whatever type it was signed as. A list claim such as `cognito:groups`
is rendered the way Go prints a slice, so two groups arrive as `[Admins Readers]`, and not as JSON or
a comma-separated list. `scopes` is `null`, not an empty list, when the token carries no `scope` claim.
AWS publishes none of that. All of it is what the real endpoint was observed to send.

A route with `AuthorizationType: "NONE"` has no caller to describe, so `requestContext.authorizer` is
left out of its events entirely.

## Protecting a route with IAM

A route declared `AuthorizationType: "AWS_IAM"` reaches its integration only when the caller is
allowed `execute-api:Invoke` on the ARN of the route being called. IAM itself decides. The route takes
no authorizer, and naming one is refused.

The caller comes from the request, through either a SigV4 signature or an `x-sim-aws-caller` header
naming a principal directly. A request offering neither is anonymous, owns no policies, and is
refused. See [callers of HTTP requests](../iam/#callers-of-http-requests) in the IAM docs for how that
resolution works and how to sign a served request.

The ARN a request is authorized against is:

```text
arn:aws:execute-api:<region>:<account>:<apiId>/<stage>/<METHOD>/<path>
```

- The Account and Region are the API's own, not the caller's.
- The stage is the one that served the request, so `$default` for the default stage.
- The method is the one the client sent, upper case. A `GET` reaching a route keyed `ANY /orders`
  gives `GET`.
- The path is the request path with the stage segment and the leading slash taken off, so
  `/dev/orders/42` served from stage `dev` gives `orders/42`. This is the path asked for, not the route
  key, because a policy is written against it by hand. A request to the API root gives an ARN ending
  `/GET/`.

An identity policy may wildcard any part of that. `<apiId>/*`, `<apiId>/$default/*` and
`<apiId>/*/GET/orders/*` all allow a `GET` of `/orders/42` on the default stage.

```typescript sim-apigatewayv2-iam-authorizer
/**
 * Protecting a simulated HTTP API route with IAM.
 */

import {
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import type { SimPayload2Event } from "@kensio/yulin/apigatewayv2";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const { FunctionArn } = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::888888888888:role/OrdersRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimPayload2Event) => ({
        statusCode: 200,
        headers: { "content-type": "text/plain" },
        body: `orders for ${
          event.requestContext.authorizer?.iam?.userArn ?? "nobody"
        }`,
      })),
    },
  }),
);

const apiGateway = simAws.apiGatewayV2();

const { ApiId, ApiEndpoint } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
);

const { IntegrationId } = await apiGateway.createIntegration(
  new CreateIntegrationCommand({
    ApiId,
    IntegrationType: "AWS_PROXY",
    IntegrationUri: FunctionArn,
    PayloadFormatVersion: "2.0",
  }),
);

await apiGateway.createRoute(
  new CreateRouteCommand({
    ApiId,
    RouteKey: "GET /orders/{orderId}",
    Target: `integrations/${IntegrationId}`,
    AuthorizationType: "AWS_IAM",
  }),
);

await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "$default", AutoDeploy: true }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "orders",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`,
  }),
);

// A Role of the API's own Account, allowed to call the orders routes of this
// API on the default stage.
await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "Reporter",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: "arn:aws:iam::888888888888:root" },
          Action: "sts:AssumeRole",
        },
      ],
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "Reporter",
    PolicyName: "InvokeOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "execute-api:Invoke",
          Resource: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/$default/GET/orders/*`,
        },
      ],
    }),
  }),
);

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${ApiEndpoint}/orders/42`);

const anonymous = await fetch(url);

console.log(anonymous.status); // 403
console.log(await anonymous.text()); // '{"message":"Forbidden"}'

const reporter = await fetch(url, {
  headers: { "x-sim-aws-caller": "arn:aws:iam::888888888888:role/Reporter" },
});

console.log(await reporter.text()); // "orders for arn:aws:iam::888888888888:role/Reporter"

await srv.close();
```

### What a refused request gets back

A caller IAM refuses is answered with a 403 and `{"message":"Forbidden"}`, and the integration is
never invoked. An unsigned request gets the same answer. The serving boundary resolves it to an
anonymous caller, and an anonymous caller is allowed nothing. An explicit `Deny` beats an `Allow`, as
it does in any IAM evaluation.

A request whose signature is malformed, or is scoped to another service, never reaches the route. The
serving boundary refuses it first, with `{"Message":"Forbidden"}` and a capital `M`.

### The caller the handler receives

An admitted request carries its caller into the event as `requestContext.authorizer.iam`:

```json
{
  "accessKey": "",
  "accountId": "888888888888",
  "callerId": "arn:aws:iam::888888888888:role/Reporter",
  "cognitoIdentity": null,
  "principalOrgId": null,
  "userArn": "arn:aws:iam::888888888888:role/Reporter",
  "userId": "arn:aws:iam::888888888888:role/Reporter"
}
```

`accountId` and `userArn` come from the resolved principal's ARN. `requestContext.accountId` carries
that Account too, in place of `anonymous`. The block is the same one a Lambda Function URL produces, so
handler code reading it behaves the same behind either.

### Callers from another Account

A principal of another Account is refused, whatever its own Account allows it. A cross-Account request
needs an Allow from the resource side as well, and an HTTP API has nowhere to put one. An HTTP API has
no resource policy at all, where a REST API does. Real AWS behaves the same way.

The way through, here and on AWS, is for that principal to assume a Role in the API's Account through
STS and sign with the session credentials. The request is then made by a principal of the API's own
Account.

## Protecting a route with a Lambda authorizer

A Lambda `REQUEST` authorizer runs a function of its own before the integration is invoked, and that
function decides. `CreateAuthorizerCommand` with `AuthorizerType: "REQUEST"` creates one, and a route
asks for it with `AuthorizationType: "CUSTOM"` and the authorizer's id.

`IdentitySource` is what the request has to carry before the function is invoked at all. Each entry
is `$request.header.<name>` or `$request.querystring.<name>`, and a request missing any one of them is
refused without the function running.

`EnableSimpleResponses: true` asks the function for `{ isAuthorized, context }`. With it off, the
function answers a `principalId` and an IAM `policyDocument` instead. Either way, the `context` it
returns reaches the integration handler as `event.requestContext.authorizer.lambda`.

```typescript sim-apigatewayv2-lambda-authorizer
/**
 * Protecting a simulated HTTP API route with a Lambda REQUEST authorizer.
 */

import {
  CreateApiCommand,
  CreateAuthorizerCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import type {
  SimHttpApiAuthorizerEvent,
  SimPayload2Event,
} from "@kensio/yulin/apigatewayv2";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const lambda = simAws.lambda();

const { FunctionArn: AuthorizerFunctionArn } = await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "session-authorizer",
    Role: "arn:aws:iam::888888888888:role/AuthorizerRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimHttpApiAuthorizerEvent) => ({
        isAuthorized: event.identitySource[0] === "session=valid",
        context: { tenant: "acme" },
      })),
    },
  }),
);

const { FunctionArn } = await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "account",
    Role: "arn:aws:iam::888888888888:role/AccountRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimPayload2Event) => ({
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event.requestContext.authorizer?.lambda),
      })),
    },
  }),
);

const apiGateway = simAws.apiGatewayV2();

const { ApiId, ApiEndpoint } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "account", ProtocolType: "HTTP" }),
);

const { IntegrationId } = await apiGateway.createIntegration(
  new CreateIntegrationCommand({
    ApiId,
    IntegrationType: "AWS_PROXY",
    IntegrationUri: FunctionArn,
    PayloadFormatVersion: "2.0",
  }),
);

const { AuthorizerId } = await apiGateway.createAuthorizer(
  new CreateAuthorizerCommand({
    ApiId,
    Name: "session-cookie",
    AuthorizerType: "REQUEST",
    AuthorizerUri: AuthorizerFunctionArn,
    AuthorizerPayloadFormatVersion: "2.0",
    EnableSimpleResponses: true,
    IdentitySource: ["$request.header.cookie"],
  }),
);

await apiGateway.createRoute(
  new CreateRouteCommand({
    ApiId,
    RouteKey: "GET /account",
    Target: `integrations/${IntegrationId}`,
    AuthorizationType: "CUSTOM",
    AuthorizerId,
  }),
);

await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "$default", AutoDeploy: true }),
);

// Each function needs its own grant: the integration is invoked under the ARN
// of the route, and the authorizer under an ARN naming the authorizer.
await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "account",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`,
  }),
);

await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "session-authorizer",
    StatementId: "api-gateway-invoke-authorizer",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/authorizers/${AuthorizerId}`,
  }),
);

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${ApiEndpoint}/account`);

const refused = await fetch(url, { headers: { cookie: "session=expired" } });

console.log(refused.status); // 403

const admitted = await fetch(url, { headers: { cookie: "session=valid" } });

console.log(await admitted.text()); // '{"tenant":"acme"}'

await srv.close();
```

The authorizer function is invoked once per request reaching the route. Caching starts once the
authorizer is given an `AuthorizerResultTtlInSeconds`, and AWS defaults it off the same way. See
[Caching the authorizer's decision](#caching-the-authorizers-decision).

### The event the authorizer receives

The function is invoked with the payload format 2.0 request event, plus three members of its own,
exported as `SimHttpApiAuthorizerEvent`:

```json
{
  "version": "2.0",
  "type": "REQUEST",
  "routeArn": "arn:aws:execute-api:us-east-1:888888888888:a1b2c3d4e5/$default/GET/account",
  "identitySource": ["session=valid"],
  "routeKey": "GET /account",
  "rawPath": "/account",
  "rawQueryString": "",
  "headers": { "cookie": "session=valid" },
  "requestContext": { "...": "as the integration receives it" }
}
```

`identitySource` carries the values found at the authorizer's identity sources, in the order they were
configured. The expressions that found them stay out of the event. `routeArn` names the route the
request matched, carrying the route key's path template. `GET /orders/{orderId}` is
`<apiId>/<stage>/GET/orders/{orderId}` whichever order was asked for.

There is no `body` and no `isBase64Encoded`. AWS's published example of this event carries neither, and
an authorizer cannot read the request body here or on AWS.

### Answering with a policy

With `EnableSimpleResponses` left off, the function answers a `principalId` and an IAM policy
document, and simulated IAM evaluates it for `execute-api:Invoke` against the route ARN. That is the
same evaluation an [`AWS_IAM` route](#protecting-a-route-with-iam) goes through, with one difference.
The request has no IAM principal behind it, and the returned document is the whole decision.
`principalId` is a name the function chose for the caller, and grants no access.

```typescript
makeLambdaZipFileInput((event: SimHttpApiAuthorizerEvent) => ({
  principalId: "user-1",
  policyDocument: {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: event.identitySource[0] === "session=valid" ? "Allow" : "Deny",
        Action: "execute-api:Invoke",
        Resource: event.routeArn,
      },
    ],
  },
  context: { tenant: "acme" },
}));
```

An explicit `Deny` beats an `Allow`, and a document with no relevant `Allow` refuses the request.

### What a refused request gets back

- A request missing any configured identity source is a 401 and `{"message":"Unauthorized"}`, and the
  authorizer function is never invoked.
- `isAuthorized: false`, or a policy that refuses `execute-api:Invoke` on the route ARN, is a 403 and
  `{"message":"Forbidden"}`.
- Returning `{ "errorMessage": "Unauthorized" }` is a 401. That is the only way the authorizer
  function produces one, and it is read whichever response format the authorizer is configured for.
- A function that throws, returns a shape matching no response format, returns a policy document
  IAM cannot read, or has no invoke permission, is a 500 and `{"message":"Internal Server Error"}`.
  The caller hears no more, the way it hears no detail about a failed integration.

The integration is never invoked in any of these cases.

### The authorizer's invoke permission

The authorizer's function is invoked under
`arn:aws:execute-api:<region>:<account>:<apiId>/authorizers/<authorizerId>`. That is the `SourceArn`
AWS documents for granting API Gateway permission to invoke one. It names no stage and no route. That
is a different grant from the integration's, and a function used for both needs both.

### Caching the authorizer's decision

`AuthorizerResultTtlInSeconds` holds a decision for that many seconds, and a request presenting the
same identity source values within it is served from that decision without the function running
again. AWS accepts up to 3600. The default, 0, holds no decision at all.

The key is the identity source values and nothing else, so one decision covers every route of the API
that uses the authorizer. Adding `$context.routeKey` as an identity source puts the route in the key.
AWS documents that for caching per route.

```typescript sim-apigatewayv2-lambda-authorizer-cache
/**
 * Caching a simulated HTTP API Lambda authorizer's decision.
 */

import {
  CreateApiCommand,
  CreateAuthorizerCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import type { SimPayload2Event } from "@kensio/yulin/apigatewayv2";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const lambda = simAws.lambda();

// An authorizer counting its own invocations, so the caller can see which
// decision served each request.
const counter = { invocations: 0 };

const { FunctionArn: AuthorizerFunctionArn } = await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "session-authorizer",
    Role: "arn:aws:iam::888888888888:role/AuthorizerRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(() => {
        counter.invocations += 1;

        return { isAuthorized: true, context: { ...counter } };
      }),
    },
  }),
);

const { FunctionArn } = await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "account",
    Role: "arn:aws:iam::888888888888:role/AccountRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimPayload2Event) => ({
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event.requestContext.authorizer?.lambda),
      })),
    },
  }),
);

const apiGateway = simAws.apiGatewayV2();

const { ApiId, ApiEndpoint } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "account", ProtocolType: "HTTP" }),
);

const { IntegrationId } = await apiGateway.createIntegration(
  new CreateIntegrationCommand({
    ApiId,
    IntegrationType: "AWS_PROXY",
    IntegrationUri: FunctionArn,
    PayloadFormatVersion: "2.0",
  }),
);

const { AuthorizerId } = await apiGateway.createAuthorizer(
  new CreateAuthorizerCommand({
    ApiId,
    Name: "session-cookie",
    AuthorizerType: "REQUEST",
    AuthorizerUri: AuthorizerFunctionArn,
    AuthorizerPayloadFormatVersion: "2.0",
    EnableSimpleResponses: true,
    IdentitySource: ["$request.header.cookie"],
    AuthorizerResultTtlInSeconds: 300,
  }),
);

await apiGateway.createRoute(
  new CreateRouteCommand({
    ApiId,
    RouteKey: "GET /account",
    Target: `integrations/${IntegrationId}`,
    AuthorizationType: "CUSTOM",
    AuthorizerId,
  }),
);

await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "$default", AutoDeploy: true }),
);

for (const [FunctionName, SourceArn] of [
  ["account", `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`],
  [
    "session-authorizer",
    `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/authorizers/${AuthorizerId}`,
  ],
]) {
  await lambda.addPermission(
    new AddPermissionCommand({
      FunctionName,
      StatementId: "api-gateway-invoke",
      Action: "lambda:InvokeFunction",
      Principal: "apigateway.amazonaws.com",
      SourceArn,
    }),
  );
}

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${ApiEndpoint}/account`);
const call = async (): Promise<unknown> => {
  const response = await fetch(url, { headers: { cookie: "session=valid" } });

  return await response.json();
};

console.log(await call()); // { invocations: 1 }
console.log(await call()); // { invocations: 1 }, held rather than asked again

// Simulated time passing the TTL drops the decision.
await simAws.clock().advanceBy({ minutes: 6 });

console.log(await call()); // { invocations: 2 }

await srv.close();
```

A refusal is held the same way an admission is, so a session the authorizer rejected stays rejected
until the TTL expires. An authorizer that could not answer at all is the exception. A function that
threw, or replied in neither format, is asked again on the next request.

Expiry is checked against the simulation's clock. `simAws.clock().advanceBy(...)` expires a decision
that was being reused a moment before, and no test has to wait.

### The context the handler receives

The `context` the authorizer returned arrives as `event.requestContext.authorizer.lambda`, with its
values as the function returned them and no stringifying on the way. An authorizer that allowed the
request and returned no context leaves `null` there, and the block still says which kind of authorizer
ran.

## The event the handler receives

The handler is invoked with the API Gateway HTTP API payload format 2.0 event, exported as
`SimPayload2Event`:

```json
{
  "version": "2.0",
  "routeKey": "$default",
  "rawPath": "/orders",
  "rawQueryString": "limit=10",
  "headers": { "host": "...", "x-forwarded-proto": "https" },
  "queryStringParameters": { "limit": "10" },
  "cookies": ["session=abc"],
  "requestContext": {
    "accountId": "anonymous",
    "apiId": "a1b2c3d4e5",
    "domainName": "a1b2c3d4e5.execute-api.eu-west-1.amazonaws.com",
    "domainPrefix": "a1b2c3d4e5",
    "http": {
      "method": "GET",
      "path": "/orders",
      "protocol": "HTTP/1.1",
      "sourceIp": "127.0.0.1",
      "userAgent": "..."
    },
    "requestId": "...",
    "routeKey": "$default",
    "stage": "$default",
    "time": "02/Aug/2026:11:00:00 +0000",
    "timeEpoch": 1785668400000
  },
  "isBase64Encoded": false
}
```

An empty field is left out of the event, as real API Gateway leaves it out. `cookies`,
`queryStringParameters`, `body`, `pathParameters` and `stageVariables` are absent when the request has
nothing for them. `rawQueryString` is the exception and is always present, as an empty string when
there was no query.

Repeated query parameters are joined with commas. Cookies travel in `cookies`, with no `cookie`
header. A body is passed through as text for a text content type and base64-encoded otherwise, with
`isBase64Encoded` saying which happened.

The headers API Gateway sets itself replace whatever the client sent under those names. `host` is the
API's own hostname, in place of the localhost one the request arrived at. `x-forwarded-proto` is
`https`, `x-forwarded-port` is `443`, `x-forwarded-for` and `requestContext.http.sourceIp` are
`127.0.0.1`, and `x-amzn-trace-id` carries an X-Ray-shaped id that no trace exists for.

The stage's variables, when it has any, reach the handler as `event.stageVariables`.

### Making one without an API

A test of the integration handler on its own, with no API in front of it, still has to pass it a
whole event. `httpApiProxyEventFactory` makes one, so such a test says what the request was and
nothing else:

```typescript sim-http-api-proxy-event-factory
/**
 * Making an HTTP API invocation event to call an integration handler with.
 */

import { VariantFactory } from "@kensio/part-factory";

import {
  httpApiProxyEventFactory,
  type SimPayload2Event,
} from "@kensio/yulin/apigatewayv2";

function ordersHandler(event: SimPayload2Event): string {
  return `${event.requestContext.http.method} ${event.pathParameters?.["orderId"] ?? "all"}`;
}

// A request naming only its route: the method and path come from the route key.
const listing = httpApiProxyEventFactory.make({ routeKey: "GET /orders" });

// GET all
console.log(ordersHandler(listing));

// A request to a parameterised route says the concrete path and what the route
// captured from it.
const orderRequestFactory = new VariantFactory(httpApiProxyEventFactory, {
  routeKey: "GET /orders/{orderId}",
});

const order = orderRequestFactory.make({
  rawPath: "/orders/YL-1",
  pathParameters: { orderId: "YL-1" },
});

// GET YL-1
console.log(ordersHandler(order));
```

The defaults describe an unauthorized `GET /` reaching the API's default stage, down to the headers
API Gateway sets itself. The route key and the request agree whichever a test gives. An event for
`rawPath: "/orders"` is one for the `GET /orders` route, and an event for `routeKey: "POST /orders"`
is a POST to `/orders`. A route key whose path is a template captures nothing on its own. An event for
a parameterised route says the concrete path and its `pathParameters` itself, as above.

`requestContext.authorizer` is absent, as it is for a route with no authorizer. Adding it is how a
test describes a request that has been through one: `{ jwt: { claims, scopes } }` for a
[Cognito user pool](#protecting-a-route-with-a-cognito-user-pool), `{ iam: { ... } }` for
[IAM](#protecting-a-route-with-iam), and `{ lambda: { ... } }` for a
[Lambda authorizer](#protecting-a-route-with-a-lambda-authorizer). A Lambda authorizer's own event
is a different shape, `SimHttpApiAuthorizerEvent`, and has no factory.

The [event factories page](../../factories/ "Test factories for AWS event shapes usage docs")
covers what the factories have in common. A Function URL invocation is the same event from a different
endpoint, and has
[its own factory](../lambda/#making-an-invocation-event-without-a-request "Simulated Lambda usage docs").

## The response the handler returns

A handler returning an object with a `statusCode` produces that HTTP response. Its `headers` are
sent as headers, its `cookies` become `set-cookie` headers, and an empty body is sent as no body,
leaving a 204 a valid response.

A handler returning anything else produces a 200 whose body is that value as JSON. That includes an
object with no `statusCode` in it. A handler returning `{ body: "hi" }` produces a 200 whose body is
the JSON `{"body":"hi"}` with `content-type: application/json`. Real API Gateway does the same.

## Reading an API back

`GetApisCommand`, `GetIntegrationsCommand`, `GetRoutesCommand` and `GetStagesCommand` list what an
API has. Each answers in full, as paging is outside the simulation.

```typescript sim-apigatewayv2-list-resources
/**
 * Listing what a simulated HTTP API has.
 */

import {
  CreateApiCommand,
  CreateStageCommand,
  GetApisCommand,
  GetStagesCommand,
} from "@aws-sdk/client-apigatewayv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const apiGateway = simAws.apiGatewayV2();

const { ApiId } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
);

await apiGateway.createStage(
  new CreateStageCommand({
    ApiId,
    StageName: "$default",
    AutoDeploy: true,
    StageVariables: { catalogue: "v2" },
  }),
);

const apis = await apiGateway.getApis(new GetApisCommand({}));

console.log(apis.Items.map((api) => api.Name));

const stages = await apiGateway.getStages(new GetStagesCommand({ ApiId }));

console.log(stages.Items[0]?.StageVariables);
```

## Deleting what an API has

`DeleteRouteCommand`, `DeleteIntegrationCommand` and `DeleteStageCommand` each take one resource off
an API and leave the rest of it in place. A deleted route stops matching, and a request that used to
reach it is answered the way any unmatched request is. A deleted stage stops resolving. A request
addressed to it finds no stage, while the routes it served are still served by the API's other stages.

An integration a route still points at cannot be deleted. That is a `BadRequestException` naming the
routes in the way, as it is on real AWS, and an API comes apart routes first and then the integrations
behind them. Deleting a route leaves its integration in place, since an integration outlives the
routes pointing at it.

```typescript sim-apigatewayv2-delete-resources
/**
 * Deleting a route, an integration and a stage from a simulated HTTP API.
 */

import {
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
  DeleteIntegrationCommand,
  DeleteRouteCommand,
  DeleteStageCommand,
  GetIntegrationsCommand,
  GetRoutesCommand,
} from "@aws-sdk/client-apigatewayv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const apiGateway = simAws.apiGatewayV2();

const { ApiId } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
);

const { IntegrationId } = await apiGateway.createIntegration(
  new CreateIntegrationCommand({
    ApiId,
    IntegrationType: "AWS_PROXY",
    IntegrationUri: "arn:aws:lambda:eu-west-2:111111111111:function:orders",
    PayloadFormatVersion: "2.0",
  }),
);

const { RouteId } = await apiGateway.createRoute(
  new CreateRouteCommand({
    ApiId,
    RouteKey: "GET /orders",
    Target: `integrations/${IntegrationId}`,
  }),
);

await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "dev", AutoDeploy: true }),
);

// The route comes off first, since the integration cannot be deleted while
// anything still targets it.
await apiGateway.deleteRoute(new DeleteRouteCommand({ ApiId, RouteId }));

await apiGateway.deleteIntegration(
  new DeleteIntegrationCommand({ ApiId, IntegrationId }),
);

await apiGateway.deleteStage(
  new DeleteStageCommand({ ApiId, StageName: "dev" }),
);

const routes = await apiGateway.getRoutes(new GetRoutesCommand({ ApiId }));
const integrations = await apiGateway.getIntegrations(
  new GetIntegrationsCommand({ ApiId }),
);

console.log(routes.Items.length, integrations.Items.length);
```

`DeleteApiCommand` deletes the API and everything under it, so taking a whole API away needs none of
these.

## Turning the generated endpoint off

`DisableExecuteApiEndpoint: true` stops the generated endpoint serving. That is how an API reachable
only through a custom domain is configured. A request to it is answered with a 403 and
`{"message":"Forbidden"}`. AWS publishes neither the status nor the body for that case, so both are
what a disabled endpoint was observed to answer.

## Importing an OpenAPI definition

`ImportApiCommand` takes a serialised OpenAPI 3.0 document and creates the API, one route and one
integration per operation, and one authorizer per security scheme an operation names. The route
key is the operation key uppercased and the path taken unchanged, since OpenAPI path templating is
already API Gateway's path parameter syntax.

An import creates no stage. `CreateStageCommand` or an `AWS::ApiGatewayV2::Stage` is still declared
separately, and an imported API with no stage answers 404.

```typescript sim-apigatewayv2-openapi
/**
 * Creating a simulated HTTP API from an OpenAPI 3 definition.
 */

import {
  CreateStageCommand,
  GetRoutesCommand,
  ImportApiCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import type { SimPayload2Event } from "@kensio/yulin/apigatewayv2";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const { FunctionArn } = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimPayload2Event) => ({
        statusCode: 200,
        headers: { "content-type": "text/plain" },
        body: `order ${event.pathParameters?.["orderId"] ?? "none"}`,
      })),
    },
  }),
);

const openApi = {
  openapi: "3.0.1",
  info: { title: "orders", version: "1.0" },
  paths: {
    "/orders/{orderId}": {
      get: {
        // Ignored, as on AWS: HTTP APIs do no request validation.
        responses: { "200": { description: "200 response" } },
        "x-amazon-apigateway-integration": {
          type: "aws_proxy",
          httpMethod: "POST",
          uri:
            `arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/` +
            `${FunctionArn}/invocations`,
          payloadFormatVersion: "2.0",
        },
      },
    },
  },
};

const apiGateway = simAws.apiGatewayV2();

const { ApiId, ApiEndpoint } = await apiGateway.importApi(
  new ImportApiCommand({ Body: JSON.stringify(openApi) }),
);

const routes = await apiGateway.getRoutes(new GetRoutesCommand({ ApiId }));

console.log(routes.Items[0]?.RouteKey); // "GET /orders/{orderId}"

// An import creates no stage, so the API answers 404 until one is created.
await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "$default", AutoDeploy: true }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "orders",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`,
  }),
);

const srv = await serveSimAws({ simAws });

const response = await fetch(srv.localUrl(`${ApiEndpoint}/orders/42`));

console.log(await response.text()); // "order 42"

await srv.close();
```

The API is named by `info.title`. `uri` is read as either the long
`arn:aws:apigateway:<region>:lambda:path/2015-03-31/functions/<function-arn>/invocations` form above
or as the bare function ARN.

### Members that are ignored

AWS sorts what an import finds into three categories, and the third is valid OpenAPI that HTTP APIs
leave unsupported. AWS ignores it silently, and so does this: `requestBody`, the content schemas under
`responses`, `components.schemas`, and an operation's `parameters`, `summary`, `description` and
`tags`. HTTP APIs perform no request validation, so a request whose body contradicts a declared
schema still reaches the handler.

Everything else the document carries and this simulation cannot apply is refused, naming the JSON
pointer of the member, such as
`#/paths/~1orders~1{orderId}/get/x-amazon-apigateway-integration/payloadFormatVersion`.

### A shared integration or authorizer

An operation's `x-amazon-apigateway-integration` may be a reference into
`components.x-amazon-apigateway-integrations`:

```json
{
  "get": {
    "x-amazon-apigateway-integration": {
      "$ref": "#/components/x-amazon-apigateway-integrations/orders"
    }
  }
}
```

The referenced definition is created once and shared by every operation naming it. A `$ref` anywhere
else is refused, naming the pointer it holds.

### Protecting an imported route

A security scheme of type `oauth2` carrying an `x-amazon-apigateway-authorizer` with `type: "jwt"`
becomes a JWT authorizer. The scheme key is the authorizer's name, one authorizer is created per
scheme, and an operation naming it gets `AuthorizationType: "JWT"` with the requirement's scope list
as its `AuthorizationScopes`. An operation with no `security` is open.

```json
{
  "components": {
    "securitySchemes": {
      "pool-authorizer": {
        "type": "oauth2",
        "x-amazon-apigateway-authorizer": {
          "type": "jwt",
          "identitySource": "$request.header.Authorization",
          "jwtConfiguration": {
            "issuer": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc",
            "audience": ["3n4b5..."]
          }
        }
      }
    }
  }
}
```

A security scheme of type `apiKey` carrying an `x-amazon-apigateway-authorizer` with
`type: "request"` becomes a Lambda `REQUEST` authorizer, and an operation naming it gets
`AuthorizationType: "CUSTOM"`. The scheme's own `name` and `in` are read by AWS for the OpenAPI
document to be valid, and `identitySource` is what decides where the values come from, here as there.

```json
{
  "components": {
    "securitySchemes": {
      "session-authorizer": {
        "type": "apiKey",
        "name": "cookie",
        "in": "header",
        "x-amazon-apigateway-authorizer": {
          "type": "request",
          "identitySource": "$request.header.cookie",
          "authorizerUri": "arn:aws:lambda:us-east-1:111111111111:function:session-authorizer",
          "authorizerPayloadFormatVersion": "2.0",
          "enableSimpleResponses": true,
          "authorizerResultTtlInSeconds": 300
        }
      }
    }
  }
}
```

A scheme whose type and whose authorizer disagree, such as a `jwt` authorizer under `apiKey`, is
refused naming the extension's own `type`.

`identitySource` is the comma-separated string a document writes. A JWT authorizer takes one entry
and a value carrying more is refused, as more than one `IdentitySource` is on `CreateAuthorizer`. A
`REQUEST` authorizer takes every entry the string names, and requires a request to carry all of them.

## CloudFormation

[Simulated CloudFormation](../cloudformation/ "Simulated CloudFormation docs") deploys
`AWS::ApiGatewayV2::Api`, `AWS::ApiGatewayV2::Authorizer`, `AWS::ApiGatewayV2::Integration`,
`AWS::ApiGatewayV2::Route` and `AWS::ApiGatewayV2::Stage`. A synthesized or hand-written template
produces an API that serves requests.

`Ref` and `Fn::GetAtt` return what real CloudFormation returns for each type:

| Resource type | `Ref`              | `Fn::GetAtt`                |
| ------------- | ------------------ | --------------------------- |
| `Api`         | the API id         | `ApiId`, `ApiEndpoint`      |
| `Authorizer`  | the authorizer id  | `AuthorizerId`              |
| `Integration` | the integration id | `IntegrationId`             |
| `Route`       | the route id       | `RouteId`                   |
| `Stage`       | the stage name     | none, as AWS documents none |

`Fn::GetAtt: ["Api", "ApiEndpoint"]` is the generated endpoint with no trailing slash and no stage
segment, on the real `amazonaws.com` hostname. CDK's `httpApi.url` is built from `AWS::URLSuffix`
instead, which resolves to the local `sim-aws.localhost` form. Both reach the same served API.

An integration's `IntegrationUri` is accepted as the bare Lambda function ARN CDK emits, and as the
`arn:aws:apigateway:<region>:lambda:path/2015-03-31/functions/<function-arn>/invocations` form. A
route's `Target` is the `integrations/<integration-id>` string, which CDK builds with `Fn::Join` over
a `Ref` to the integration.

```typescript sim-apigatewayv2-cloudformation
/**
 * Deploying a simulated HTTP API from a CloudFormation template.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      HandlerRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "orders-role",
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "lambda.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
        },
      },
      Handler: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "orders",
          Role: { "Fn::GetAtt": ["HandlerRole", "Arn"] },
          Handler: "index.handler",
          Runtime: "nodejs20.x",
          Code: {
            ZipFile:
              "exports.handler = async () => ({ statusCode: 200, body: 'orders' });",
          },
        },
      },
      HandlerPermission: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          Action: "lambda:InvokeFunction",
          FunctionName: { "Fn::GetAtt": ["Handler", "Arn"] },
          Principal: "apigateway.amazonaws.com",
          SourceArn: {
            "Fn::Join": [
              "",
              [
                "arn:aws:execute-api:us-east-1:111111111111:",
                { Ref: "Api" },
                "/*/*",
              ],
            ],
          },
        },
      },
      Api: {
        Type: "AWS::ApiGatewayV2::Api",
        Properties: { Name: "orders", ProtocolType: "HTTP" },
      },
      Stage: {
        Type: "AWS::ApiGatewayV2::Stage",
        Properties: {
          ApiId: { Ref: "Api" },
          StageName: "$default",
          AutoDeploy: true,
        },
      },
      Integration: {
        Type: "AWS::ApiGatewayV2::Integration",
        Properties: {
          ApiId: { Ref: "Api" },
          IntegrationType: "AWS_PROXY",
          IntegrationUri: { "Fn::GetAtt": ["Handler", "Arn"] },
          PayloadFormatVersion: "2.0",
        },
      },
      Route: {
        Type: "AWS::ApiGatewayV2::Route",
        Properties: {
          ApiId: { Ref: "Api" },
          RouteKey: "GET /orders",
          AuthorizationType: "NONE",
          Target: {
            "Fn::Join": ["", ["integrations/", { Ref: "Integration" }]],
          },
        },
      },
    },
    Outputs: {
      ApiEndpoint: { Value: { "Fn::GetAtt": ["Api", "ApiEndpoint"] } },
    },
  },
});

await stack.waitForDeployComplete();

// https://<api-id>.execute-api.us-east-1.amazonaws.com
const apiEndpoint = stack.outputs.get("ApiEndpoint")?.value as string;

const srv = await serveSimAws({ simAws });

const response = await fetch(srv.localUrl(`${apiEndpoint}/orders`));

console.log(response.status);
console.log(await response.text());

await srv.close();
```

Every property outside the simulated set is left out of what is created and recorded in
[`stack.ignoredProperties`](../cloudformation/README.md#properties-a-resource-was-created-without),
naming the Resource type, the logical id and the ones this can act on instead. The API, authorizer,
integration, route or stage is created either way. The stack deploys, and the record says which of its
parts behaves differently to the template. The simulated properties are:

- `Api`: `Name`, `ProtocolType`, `Description`, `DisableExecuteApiEndpoint`, `Body`,
  `FailOnWarnings`
- `Authorizer`: `ApiId`, `Name`, `AuthorizerType`, `IdentitySource`, `JwtConfiguration`,
  `AuthorizerUri`, `AuthorizerPayloadFormatVersion`, `EnableSimpleResponses`,
  `AuthorizerResultTtlInSeconds`
- `Integration`: `ApiId`, `IntegrationType`, `IntegrationUri`, `PayloadFormatVersion`, `Description`
- `Route`: `ApiId`, `RouteKey`, `Target`, `AuthorizationType`, `AuthorizerId`, `AuthorizationScopes`
- `Stage`: `ApiId`, `StageName`, `AutoDeploy`, `StageVariables`, `Description`

CDK's `HttpIamAuthorizer` deploys too. It emits no `AWS::ApiGatewayV2::Authorizer` and no
`AuthorizerId`, only `AuthorizationType: "AWS_IAM"` on the `Route`, and the deployed route then
requires IAM authorization when it is served.

CDK's `HttpJwtAuthorizer` and `HttpUserPoolAuthorizer` both deploy. `HttpUserPoolAuthorizer` builds
its issuer from `Fn::GetAtt <UserPool>.ProviderURL`, which resolves to the same string the pool's
tokens name as their issuer. A CDK-declared authorizer and a CDK-deployed pool agree, with no
configuration to write. Pass the app client explicitly through `userPoolClients`, because otherwise the
authorizer adds a client of its own with CDK's defaults, and those emit the OAuth properties
[simulated Cognito refuses](../cognito/#limitations).

An `Authorizer` with `AuthorizerType: "REQUEST"` deploys as a Lambda authorizer, and a `Route` with
`AuthorizationType: "CUSTOM"` and a `Ref` to it is decided by that authorizer's function.
`AuthorizerUri` is read the same way an integration's URI is. The bare function ARN and the
`arn:aws:apigateway:<region>:lambda:path/2015-03-31/functions/<function-arn>/invocations` form both
work. The `AWS::Lambda::Permission` alongside it needs a `SourceArn` of
`arn:aws:execute-api:<region>:<account>:<api-id>/authorizers/<authorizer-id>`. That is what CDK
writes, and what the authorizer is invoked under. A function used both as an integration and as an
authorizer needs two permissions, as it does on AWS.

CDK's `HttpLambdaAuthorizer` deploys when it is given `responseTypes: [HttpLambdaResponseType.SIMPLE]`.
Its default is `IAM`, which sets `AuthorizerPayloadFormatVersion` to `1.0`, and that authorizer event
is [not simulated](#limitations).

```typescript
const authorizer = new HttpLambdaAuthorizer("SessionAuthorizer", authorizerFn, {
  responseTypes: [HttpLambdaResponseType.SIMPLE],
  identitySource: ["$request.header.cookie"],
});

httpApi.addRoutes({
  path: "/account",
  methods: [HttpMethod.GET],
  integration: new HttpLambdaIntegration("Account", accountFn),
  authorizer,
});
```

A `Route` with `AuthorizationType: "JWT"` or `"CUSTOM"` whose `AuthorizerId` resolves to something
other than an authorizer of that API, or to one of the other kind, fails the stack, naming both. That
covers a `Ref` to a Resource this simulation skipped. A skipped Resource resolves to its own logical
ID, and no authorizer has that id.

`Api.Body` carries an OpenAPI document as an inline JSON object. CloudFormation resolves `Ref` and
`Fn::GetAtt` inside it as it does anywhere else, and an operation's integration URI can be an
`Fn::GetAtt` on a function the same stack deploys. The document goes through the same `ImportApi`
translator an SDK caller reaches, so the two produce the same API.

```yaml
Api:
  Type: AWS::ApiGatewayV2::Api
  Properties:
    Body:
      openapi: "3.0.1"
      info: { title: orders, version: "1.0" }
      paths:
        /orders/{orderId}:
          get:
            x-amazon-apigateway-integration:
              type: aws_proxy
              httpMethod: POST
              uri: !GetAtt Handler.Arn
              payloadFormatVersion: "2.0"
```

`Name` and `ProtocolType` are both optional alongside a `Body`, as AWS documents. A `ProtocolType`
that is present has to be `HTTP`, and a `Name` that is present names the API in place of the
document's `info.title`. `Description` and `DisableExecuteApiEndpoint` are recorded rather than
applied alongside a `Body`, because `ImportApi` takes neither, and no command here changes an API
after it is created. The API is created from the document without them, and the stack deploys.

A template combining an `Api` with a `Body` and a separate `Route`, `Integration` or `Authorizer`
Resource for that same API fails the stack, naming both logical IDs. The document already declares
the API's parts, and which of the two AWS would keep is unestablished.

An `Api` carrying a `Policy` property is refused with its own message, in place of the generic one.
AWS has no such property on this Resource type, because an HTTP API has no resource policy. A template
carrying one was written for a REST API.

`AWS::ApiGatewayV2::Deployment`, `DomainName`, `ApiMapping`, `VpcLink` and the WebSocket-only
`Model`, `RouteResponse` and `IntegrationResponse` create no resource. A template carrying one has
that resource skipped.

## Authorization

Every command is authorized by simulated IAM. API Gateway is unusual in what it asks for. The action
is the HTTP method of the underlying REST call, not a name matching the SDK operation, and the
resource is the request path, where other services name an ARN. Creating a route on API
`a1b2c3d4e5` asks whether the caller may `apigateway:POST` on
`arn:aws:apigateway:<region>::/apis/a1b2c3d4e5/routes`. Those ARNs carry no Account id, as API Gateway
control-plane ARNs leave the Account segment empty.

A policy written the way policies for other services are written matches no request here, as it
matches none on real AWS.

## SDK interception

An `ApiGatewayV2Client` can be intercepted, so application code that builds its own client reaches
the simulation without being given one. See the
[SDK interception docs](../../sdk/ "Simulated AWS SDK interception docs").

## Available functionality

- `CreateApi`, `GetApi`, `GetApis` and `DeleteApi`, with the API id, the generated endpoint, and the
  Account and Region scoping a real API has
- `CreateIntegration`, `GetIntegrations` and `DeleteIntegration` for an `AWS_PROXY` integration
  naming a Lambda function, with an integration a route still targets refused, never deleted
- `CreateRoute`, `GetRoutes` and `DeleteRoute`, with route keys parsed and validated at creation,
  requests matched to a route by method, literal segment, `{name}` parameter, `{proxy+}` parameter
  and `$default`, and a deleted route no longer matching anything
- Path parameters captured by the matched route, reaching the handler as `event.pathParameters`
- `CreateAuthorizer`, `GetAuthorizers` and `DeleteAuthorizer` for a JWT authorizer, and routes
  protected by one with `AuthorizationType: "JWT"` and `AuthorizationScopes`
- Real RS256 verification of a token against the keys its issuer publishes, with the claims checked
  against the simulation's clock, and the accepted claims reaching the handler as
  `event.requestContext.authorizer.jwt`
- Routes protected with `AuthorizationType: "AWS_IAM"`, evaluating `execute-api:Invoke` against the
  `execute-api` ARN of the route being called, for a caller resolved from a SigV4 signature or an
  `x-sim-aws-caller` header, and reaching the handler as `event.requestContext.authorizer.iam`
- `CreateAuthorizer`, `GetAuthorizers` and `DeleteAuthorizer` for a Lambda `REQUEST` authorizer, and
  routes protected by one with `AuthorizationType: "CUSTOM"`, invoking the authorizer's function with
  the payload format 2.0 authorizer event, reading a simple response or an IAM policy response, and
  passing the returned context to the handler as `event.requestContext.authorizer.lambda`
- `AuthorizerResultTtlInSeconds`, holding a decision against the identity source values it was made
  for and expiring it against the simulation's clock, with `$context.routeKey` as an identity source
  to hold one per route
- `CreateStage`, `GetStages` and `DeleteStage` for the `$default` stage and for named stages served
  under their own path segment, including stage variables
- Serving the generated endpoint through `serveSimAws`, invoking the integrated function with a
  payload format 2.0 event and turning its result back into an HTTP response
- The invoke permission of an integration's function and of an authorizer's, each evaluated against
  that function's resource policy with its own `AWS:SourceArn`
- `DisableExecuteApiEndpoint`, refusing requests to the generated endpoint
- `ImportApi` for an OpenAPI 3.0 document, creating one route and one integration per operation and
  one JWT or Lambda `REQUEST` authorizer per security scheme an operation names
- Deployment of `AWS::ApiGatewayV2::Api`, `Authorizer`, `Integration`, `Route` and `Stage` from a
  CloudFormation template, including one synthesized by CDK from an `HttpApi`, and an `Api` declared
  as an OpenAPI document through `Body`
- Authorization of every command by simulated IAM, against the HTTP method and resource path real
  API Gateway uses
- SDK interception of an `ApiGatewayV2Client`

## Limitations

Current documented limitations:

- HTTP APIs only. `ProtocolType: "WEBSOCKET"` is refused.
- Two of the route selection rules, and the place of the method comparison in the order, are observed
  rather than published by AWS. See [Which route serves a request](#which-route-serves-a-request).
- A route path naming the same parameter twice, such as `GET /pets/{id}/toys/{id}`, is refused. This
  is stricter than AWS is known to be. It was refused because only one of the two captures could
  reach the handler, and not because real API Gateway was seen to refuse it.
- Deployments are outside the simulation, so `CreateStage` requires `AutoDeploy: true`. A stage
  without it serves whichever Deployment it was given, which on real AWS is nothing until one is
  created.
- `RouteSettings`, `DefaultRouteSettings` and `AccessLogSettings` on a stage are refused, as is any
  other option `CreateStage` takes and this one lacks.
- `AWS_PROXY` is the only integration type, and its URI must name an unqualified Lambda function
  ARN, written either as that ARN or as the
  `arn:aws:apigateway:<region>:lambda:path/2015-03-31/functions/<function-arn>/invocations` form.
  Both reach the same function, and `GetIntegrations` answers with the function ARN whichever was
  written. A version or alias qualifier is refused, since simulated Lambda has no versions. HTTP
  proxy integrations and AWS service integrations are outside the simulation.
- Payload format 1.0 is refused. A handler written for 1.0 reads event fields absent from a 2.0
  event, so treating one as the other would pass here and fail on AWS.
- `AuthorizationScopes` on an `AWS_IAM` or `CUSTOM` route is refused. This is stricter than AWS, which
  documents route scopes as meaningful only for `JWT` and ignores them here. Accepting one would let a
  test assert on a scope restriction no code applies.
- The method and path segments of the ARN an `AWS_IAM` route is authorized against are inferred
  rather than documented, and the two callers of that ARN builder fill them differently. This one
  names the request's own method and path, while the integration's invoke permission names the route
  key template. AWS documents one format for both. See
  [Protecting a route with IAM](#protecting-a-route-with-iam).
- A `*` in a policy resource is uniformly greedy here, so it crosses `/` boundaries. AWS distinguishes
  `*` from `*/*` in some ARN path positions. That makes the simulator more permissive than AWS for a
  policy relying on the distinction.
- Only `execute-api:Invoke` is evaluated. The action string a policy names goes unconstrained, so a
  policy can be written with `execute-api:ManageConnections` or `execute-api:InvalidateCache` and
  nothing will ever ask about it.
- `accessKey` in the `iam` block is empty, `callerId` and `userId` carry the caller ARN rather than
  the `AIDA`/`AROA` unique id real AWS puts there, and `cognitoIdentity` and `principalOrgId` are
  always null. None of those is available at the simulator's request boundary.
- A request signed for another service is refused by the serving boundary before route matching, even
  on a `NONE` route, where real API Gateway would ignore the signature. That boundary answers
  `{"Message":"Forbidden"}` with a capital `M`, unlike the API's own refusals.
- An unsigned request to an `AWS_IAM` route is a 403 rather than the 403 with an
  `x-amzn-ErrorType` of `IncompleteSignatureException` real API Gateway was observed to send. The
  simulator resolves such a request to an anonymous caller and refuses it by ordinary IAM evaluation.
- HTTP API resource policies are outside the simulation, because AWS has none. A caller from another
  Account is therefore always refused, since a cross-Account request needs an Allow from the resource
  side. Assume a Role in the API's Account instead. That is the route through on AWS as well.
- `AuthorizerPayloadFormatVersion: "2.0"` is required on a `REQUEST` authorizer, and omitting it is
  refused too. AWS defaults it to `1.0`, which builds a different event and answers a policy
  against a method ARN, and none of that is built here. CDK defaults `HttpLambdaAuthorizer` to
  `responseTypes: [HttpLambdaResponseType.IAM]`, which sets the format to `1.0`, so a default
  `new HttpLambdaAuthorizer(...)` fails the stack. Pass
  `responseTypes: [HttpLambdaResponseType.SIMPLE]` to get an authorizer that deploys.
- A `REQUEST` authorizer's event carries no `body` and no `isBase64Encoded`. AWS's published example
  of that event carries neither, so an authorizer cannot read the request body.
- An authorizer function that throws is a 500 rather than a 401. Real Lambda turns a thrown error
  into a payload carrying `errorMessage`, and simulated Lambda rejects with the error itself, so
  returning `{ "errorMessage": "Unauthorized" }` is how an authorizer asks for a 401 here.
- `AuthorizerCredentialsArn` is refused on `CreateAuthorizer`, as is `authorizerCredentials` in an
  imported document. On an `AWS::ApiGatewayV2::Authorizer` it is recorded instead, and the authorizer
  is created without it. It names a Role API Gateway assumes to invoke the authorizer, and the
  function's own resource policy is the whole decision here.
- `AuthorizerResultTtlInSeconds` is accepted between 0 and 3600, the range AWS accepts, and is refused
  on an authorizer with no `IdentitySource`, since the held decision would have no key.
- A held decision is the whole answer. A policy response is re-evaluated per route only on a cache
  miss. That is what AWS's own warning about caching describes, and `$context.routeKey` as an identity
  source is the documented way to separate routes.
- An authorizer that could not answer at all, by throwing or by replying in neither format, is never
  held. There is no answer to hold, and the next request asks the function again.
- A `REQUEST` authorizer requires at least one `IdentitySource`. An authorizer with none is invoked
  for every request on AWS, including one carrying nothing, and that is outside the simulation.
- A `REQUEST` authorizer's identity source is `$request.header.<name>`,
  `$request.querystring.<name>` or `$context.routeKey`. The rest of `$context` and all of
  `$stageVariables`, which a `REQUEST` authorizer may also name on AWS, are refused, with nowhere to
  read them from. A JWT authorizer takes one identity source naming something the client sent, so
  `$context.routeKey` is refused for it, and a second source is refused outright.
- An identity source with an empty name after its prefix is refused, and so is one whose header name is
  invalid as an HTTP field name. Each would find no value on any request, and an invalid header name
  would fail at request time, far from the command that configured it.
- `JwtConfiguration.Audience` is required. AWS documents no behaviour for an authorizer with an empty
  audience list. This may be stricter than AWS, in the direction that cannot quietly admit an app
  client.
- A token with no `exp` claim is refused. Real Cognito always sets one, and admitting a token with no
  expiry is the divergence worth failing on.
- `token_use` goes unchecked, as it does on real API Gateway. An ID token passes an authorizer that
  configures only an audience. See
  [Route scopes, and access tokens versus ID tokens](#route-scopes-and-access-tokens-versus-id-tokens).
- `aws.cognito.signin.user.admin` is the only scope any simulated Cognito flow issues, and the only
  satisfiable route scope. Resource servers, custom scopes and the client credentials grant are
  outside the simulation.
- A token invalidated by `GlobalSignOut` still passes. Real API Gateway knows nothing about the pool's
  issued tokens, so consulting them here would refuse a token AWS would accept.
- The pool's JWKS is read in process rather than fetched. A pool's published OpenID configuration
  names the localhost origin it is served from while its tokens name the real AWS URL. A discovery
  client would reject its own issuer's tokens.
- One signing key per issuer, no key rotation and no JWKS caching. Real Cognito publishes two keys
  and rotates between them, so code assuming a single entry passes here and is still wrong on AWS.
- The 403 body for an unmet route scope, the string rendering of claim values, and `scopes` being
  `null` rather than `[]` are all what the real endpoint was observed to send. AWS publishes none of
  them. Only the one `error_description` AWS documents is ever sent, and every other refusal names the
  scheme and nothing else. AWS publishes no layout for the `www-authenticate` parameters around that
  description either, so they are comma-separated as RFC 6750 writes them.
- Deleting an authorizer a route still points at leaves that route refusing every request. What real
  API Gateway does with such a route is unestablished. It stays closed here.
- The method and path segments of the source ARN are inferred rather than documented. See
  [Granting the API permission to invoke the function](#granting-the-api-permission-to-invoke-the-function).
- An integration `CredentialsArn`, the IAM Role alternative to a resource policy grant, is refused
  by `CreateIntegration`. A permission on the function is the only way to admit the invocation.
- No `Update*` commands. A route, integration or stage is changed by deleting it and creating it
  again. `DeleteApi` deletes everything under the API, as it does on AWS.
- Custom domain names and API mappings are outside the simulation. They change what `rawPath` holds,
  so an API reached through one behaves differently on AWS from what is served here.
- No paging. `MaxResults` and `NextToken` are refused, never ignored, and every list command answers
  in full.
- `CorsConfiguration` and `Tags` are refused, as is the `RouteKey`/`Target` quick-create shorthand on
  `CreateApi`. Anything else the real commands accept and this one lacks is refused by name rather
  than dropped.
- `AWS::ApiGatewayV2::Api` records `CorsConfiguration` rather than applying it. CORS request handling
  is outside the simulation, so a CDK stack using `corsPreflight` deploys and its API answers preflight
  requests here differently from AWS. The record is where a test checks that.
- Only OpenAPI 3.0.x is imported. A `swagger: "2.0"` document and an `openapi: "3.1.0"` one are both
  refused by version, and only JSON is parsed, not YAML.
- `FailOnWarnings` is honoured only in its strict sense. Everything an import cannot apply is refused
  outright, with no warning, so `true` is accepted and has no further effect and `false` is refused by
  name. What AWS defaults the property to is unestablished, and no code here relies on a default.
- `Basepath` on `ImportApi`, `BasePath` on `AWS::ApiGatewayV2::Api` and `servers` in the document are
  all refused. A base path changes the path every route matches on, which belongs with custom domain
  names.
- `ReimportApi` is outside the simulation, as every `Update*` command is. Delete the API and import
  again.
- An imported `operationId` is dropped. AWS maps it to the route's
  `OperationName`, and no command here takes one.
- A `trace` operation, a path item `$ref`, `x-amazon-apigateway-any-method` and a document-level
  `security` are each refused by name. None of the four is established for HTTP APIs by the research
  behind this, so each is refused, and never turned into a route the API may lack on AWS.
- An operation carrying more than one security requirement is refused, as is a requirement naming
  more than one scheme. A route has one authorizer.
- Anything other than an `oauth2` scheme with an explicit `jwtConfiguration.issuer` is refused. That
  includes `openIdConnect`, where AWS reads the issuer out of the discovery document at
  `openIdConnectUrl`. Nothing here is fetched over HTTP, and taking the URL as the issuer would
  mismatch every token's `iss` and answer a silent 401.
- `http_proxy` integrations, `integrationMethod`, `integrationSubtype`, `requestParameters`,
  `credentials`, `tlsConfig`, `responseTransferMode`, `connectionId` and `connectionType` in an
  imported integration are all refused by name, as their `AWS::ApiGatewayV2::Integration`
  counterparts are.
- `x-amazon-apigateway-cors` is refused, alongside the `CorsConfiguration` refusal above.
- A referenced `x-amazon-apigateway-integrations` definition becomes one shared integration, so two
  operations naming it produce one entry in `GetIntegrations`. Whether AWS shares one or creates one
  per use is unestablished. This is what a reusable definition reads as.
- A `Name` on an `AWS::ApiGatewayV2::Api` with a `Body` names the API rather than the document's
  `info.title`. Which of the two AWS takes when both are present is unestablished, and it affects only
  the name `GetApi` reports.
- A terminal `{proxy+}` in an imported path reaches `CreateRoute` unchanged. Greedy segments are
  established for route keys, and not for OpenAPI path templating.
- `AWS::ApiGatewayV2::Api` records `BodyS3Location` rather than reading it. The API is created with no
  routes at all. Reading a document out of a simulated S3 bucket adds a fetch path and nothing about
  OpenAPI.
- `AWS::ApiGatewayV2::Api` refuses `Policy` with a message of its own saying an HTTP API has no
  resource policy. The real Resource type has no such property. A template carrying one was written
  for a REST API, not against a gap here.
- A stack update replaces a changed resource of these types rather than updating it in place, as it
  does for any other type. See the [CloudFormation limitations](../cloudformation/#limitations).
- Access logging, throttling, usage plans and API keys are outside the simulation.
- The response an API Gateway endpoint returns itself uses a lower-case `message` field, as a real
  HTTP API does. A Lambda Function URL uses `Message` for the same thing, so the two cannot be
  swapped.
