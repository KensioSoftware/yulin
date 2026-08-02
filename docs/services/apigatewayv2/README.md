# Simulated API Gateway HTTP APIs

Yulin includes a simulated API Gateway v2 service, reachable as `simAws.apiGatewayV2()`. It covers
HTTP APIs with a Lambda proxy integration, so a handler that runs behind an HTTP API can be tested
against a real HTTP request rather than against a hand-built event.

WebSocket APIs are not simulated, and neither are REST APIs, which are the older API Gateway v1
service and a separate SDK client.

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

A name is not an identity here, as it is not on real AWS. Two APIs in one Account and Region may
share a name, and only the id tells them apart.

## Routing requests to a Lambda function

An API needs three more resources before it serves anything: an integration naming the function, a
route pointing at that integration, and a stage to serve it from. Once they exist, `serveSimAws`
answers requests to the generated endpoint by invoking the function.

Pass the API endpoint through `srv.localUrl(...)`, which keeps the endpoint's hostname but sends the
request to the local server, in the same way it adapts simulated S3 website and Lambda Function URL
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
import { CreateFunctionCommand } from "@aws-sdk/client-lambda";

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

const srv = await serveSimAws({ simAws });

const response = await fetch(srv.localUrl(`${ApiEndpoint}/orders?limit=10`));

console.log(response.status);
console.log(await response.text());

srv.close();
```

The `$default` route matches any method and path, so every request to the endpoint reaches the
function. The integration URI is the function's ARN, and the function may be in another Account or
Region: it is looked up where its ARN says it is.

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

A field with nothing in it is left out rather than set to null, which is what real API Gateway does:
`cookies`, `queryStringParameters`, `body`, `pathParameters` and `stageVariables` are absent when the
request has nothing for them. `rawQueryString` is the exception and is always present, as an empty
string when there was no query.

Repeated query parameters are joined with commas, cookies travel in `cookies` rather than in a
`cookie` header, and a body is passed through as text for a text content type and base64-encoded
otherwise, with `isBase64Encoded` saying which happened.

The headers API Gateway sets itself replace whatever the client sent under those names: `host` is the
API's own hostname rather than the localhost one the request arrived at, `x-forwarded-proto` is
`https`, `x-forwarded-port` is `443`, `x-forwarded-for` and `requestContext.http.sourceIp` are
`127.0.0.1`, and `x-amzn-trace-id` carries an X-Ray-shaped id that no trace exists for.

The stage's variables, when it has any, reach the handler as `event.stageVariables`.

## The response the handler returns

A handler returning an object with a `statusCode` produces that HTTP response. Its `headers` are
sent as headers, its `cookies` become `set-cookie` headers, and an empty body is sent as no body, so
a 204 stays a valid response.

A handler returning anything else produces a 200 whose body is that value as JSON. That includes an
object with no `statusCode` in it, so a handler returning `{ body: "hi" }` produces a 200 whose body
is the JSON `{"body":"hi"}` with `content-type: application/json`, which is what real API Gateway
does with it.

## Reading an API back

`GetApisCommand`, `GetIntegrationsCommand`, `GetRoutesCommand` and `GetStagesCommand` list what an
API has. Each answers in full, since paging is not simulated.

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

## Turning the generated endpoint off

`DisableExecuteApiEndpoint: true` stops the generated endpoint serving, which is how an API reachable
only through a custom domain is configured. A request to it is answered with a 403 and
`{"message":"Forbidden"}`. AWS publishes neither the status nor the body for that case, so both are
what a disabled endpoint was observed to answer rather than something documented.

## Authorization

Every command is authorized by simulated IAM. API Gateway is unusual in what it asks for: the action
is the HTTP method of the underlying REST call rather than a name matching the SDK operation, and the
resource is the request path rather than an ARN naming a resource type. Creating a route on API
`a1b2c3d4e5` asks whether the caller may `apigateway:POST` on
`arn:aws:apigateway:<region>::/apis/a1b2c3d4e5/routes`. Those ARNs carry no Account id, as API Gateway
control-plane ARNs leave the Account segment empty.

A policy written the way policies for other services are written matches nothing here, as it matches
nothing on real AWS.

## SDK interception

An `ApiGatewayV2Client` can be intercepted, so application code that builds its own client reaches
the simulation without being given one. See the
[SDK interception docs](../../sdk/ "Simulated AWS SDK interception docs").

## Available functionality

- `CreateApi`, `GetApi`, `GetApis` and `DeleteApi`, with the API id, the generated endpoint, and the
  Account and Region scoping a real API has
- `CreateIntegration` and `GetIntegrations` for an `AWS_PROXY` integration naming a Lambda function
- `CreateRoute` and `GetRoutes` for the `$default` catch-all route
- `CreateStage` and `GetStages` for the `$default` stage, including stage variables
- Serving the generated endpoint through `serveSimAws`, invoking the integrated function with a
  payload format 2.0 event and turning its result back into an HTTP response
- `DisableExecuteApiEndpoint`, refusing requests to the generated endpoint
- Authorization of every command by simulated IAM, against the HTTP method and resource path real
  API Gateway uses
- SDK interception of an `ApiGatewayV2Client`

## Limitations

Current documented limitations:

- HTTP APIs only. `ProtocolType: "WEBSOCKET"` is refused.
- `$default` is the only route key, so route matching by method and path is not simulated and every
  request reaches the one route. A route key such as `GET /orders` is refused rather than accepted
  and never matched. `pathParameters` therefore never has anything in it.
- `$default` is the only stage name, so a stage served under a stage path segment is not simulated.
- Deployments are not simulated, so `CreateStage` requires `AutoDeploy: true`. A stage without it
  serves whichever Deployment it was given, which on real AWS is nothing until one is created.
- `AWS_PROXY` is the only integration type, and its URI must be an unqualified Lambda function ARN.
  A version or alias qualifier is refused, since simulated Lambda has no versions. HTTP proxy
  integrations and AWS service integrations are not simulated.
- Payload format 1.0 is refused. A handler written for 1.0 reads event fields a 2.0 event does not
  have, so treating one as the other would pass here and fail on AWS.
- `AuthorizationType: "NONE"` only. JWT authorizers, `AWS_IAM` routes and Lambda authorizers are not
  simulated, so a route is open here that would be closed on AWS if it asked for one. The route is
  refused rather than created open.
- The integrated function's resource policy is not evaluated. Real API Gateway needs
  `lambda:InvokeFunction` granted to `apigateway.amazonaws.com`, and needs it explicitly for a
  function in another Account, so an integration can work here that would return a 500 on AWS.
- No `Update*` commands, and no per-resource `Delete*`. A route, integration or stage is changed by
  deleting its API and creating it again. `DeleteApi` deletes everything under the API, as it does on
  AWS.
- No paging. `MaxResults` and `NextToken` are refused rather than ignored, and every list command
  answers in full.
- `CorsConfiguration` and `Tags` are refused, as is the `RouteKey`/`Target` quick-create shorthand on
  `CreateApi`. Anything else the real commands accept and this one does not is refused by name rather
  than dropped.
- Custom domain names, access logging, route settings, throttling, usage plans and API keys are not
  simulated.
- No CloudFormation resource types yet, so an `AWS::ApiGatewayV2::Api` in a template is not created.
- The response an API Gateway endpoint returns itself uses a lower-case `message` field, as a real
  HTTP API does. A Lambda Function URL uses `Message` for the same thing, so the two are not
  interchangeable.
