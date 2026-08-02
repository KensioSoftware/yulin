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
route pointing at that integration, and a stage to serve it from. The function also has to allow API
Gateway to invoke it, which is a permission on the function rather than anything on the API. See
[Granting the API permission to invoke the function](#granting-the-api-permission-to-invoke-the-function).
Once all of that exists, `serveSimAws` answers requests to the generated endpoint by invoking the
function.

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

srv.close();
```

The `$default` route matches any method and path, so every request to the endpoint reaches the
function. The integration URI is the function's ARN, and the function may be in another Account or
Region: it is looked up where its ARN says it is.

## Granting the API permission to invoke the function

A Lambda proxy integration does not work until the function's resource policy allows
`apigateway.amazonaws.com` to invoke it. The console adds that permission for you; an integration
created through CloudFormation, the CLI or an SDK does not, which is what `AddPermissionCommand` in
the example above is for. Without it the request is answered with a 500 and
`{"message":"Internal Server Error"}`, and the handler does not run. CDK's
`HttpLambdaIntegration` emits the same grant as an `AWS::Lambda::Permission`.

Each request is authorized as `lambda:InvokeFunction` on the function ARN, with the caller being the
service principal `apigateway.amazonaws.com`. The function's own resource policy is what decides: a
service principal has no identity policies of its own. The route that matched is supplied as
`AWS:SourceArn`, so a permission may be granted for one route and not another:

```text
arn:aws:execute-api:<region>:<account>:<apiId>/<stage>/<METHOD>/<route path>
```

- The Account and Region are the API's, not the function's.
- The stage is the one that served the request, so `$default` for the default stage.
- The method is the request's own, so a `GET` reaching a route keyed `ANY /orders` gives `GET`.
- The path is the matched route key's template with its parameter braces intact, so a request to
  `/orders/42` on the route `GET /orders/{orderId}` gives `orders/{orderId}`. A `SourceArn` is
  written against route keys rather than against paths, and IAM treats a brace as an ordinary
  character.
- The `$default` route has no method and no path of its own, so both collapse into one `$default`
  segment: `<apiId>/<stage>/$default`.

A `SourceArn` may wildcard any part of that, which is what the usual grant does:
`<apiId>/*/*` allows every route of the API on every stage.

`AWS:SourceArn` is the only condition key supplied here. A permission that also carries
`SourceAccount`, `PrincipalOrgID` or `InvokedViaFunctionUrl` never matches, since nothing gives those
keys a value at request time, so the request is refused with the same 500.

Neither the method nor the path is documented by AWS as the value API Gateway supplies. Both are
inferred from the permission patterns AWS and CDK write, which is recorded next to the code that
builds the ARN.

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

A route key that cannot be read is refused by `CreateRoute` with a `BadRequestException`, which is
where real API Gateway refuses it too. That covers a lower-case method, an unbalanced brace, and a
greedy parameter anywhere but the end.

A parameter name is not part of a route's identity, so `GET /pets/{id}` and `GET /pets/{petId}` are
the same route key and creating the second gives a `ConflictException`.

One path may not name the same parameter twice, so `GET /pets/{id}/toys/{id}` is refused. A handler
reads path parameters off one object, so only one of the two captures could arrive. Whether real API
Gateway refuses it is not established, so this is stricter than AWS rather than known to match it.

## Which route serves a request

More than one route may match a request, and the most specific one takes it. In order:

1. A route matching the whole path beats a route ending in a greedy parameter, which beats
   `$default`.
2. An exact method beats `ANY`.
3. The path decides, segment by segment from the left, with a literal beating a `{name}` parameter
   and a `{name}` beating a `{name+}`. Comparing left to right is also what makes the longest literal
   prefix win between two greedy routes, so `GET /pets/dog/{proxy+}` takes `/pets/dog/collars/1`
   ahead of `GET /pets/{proxy+}`.

AWS's worked example, which is encoded as a test here:

| Request           | Route selected       |
| ----------------- | -------------------- |
| `GET /pets/dog/1` | `GET /pets/dog/1`    |
| `GET /pets/dog/2` | `GET /pets/dog/{id}` |
| `GET /pets/cat/1` | `GET /pets/{proxy+}` |
| `POST /test/5`    | `ANY /{proxy+}`      |

from the routes `GET /pets/dog/1`, `GET /pets/dog/{id}`, `GET /pets/{proxy+}`, `ANY /{proxy+}` and
`$default`.

Rule 1 is documented by AWS, as is the literal-beating-parameter part of rule 3. Rule 2, the
longest-literal-prefix part of rule 3, and the place of the method comparison above the path
comparison rather than below it, are observed rather than documented. Each is marked in the code next
to the rule it governs.

A request whose path matches a route but whose method does not simply matches nothing. An API with no
`ANY` route, no greedy route and no `$default` route to catch it answers 404, not 405.

## Path parameters and named stages

What a route captured reaches the handler as `event.pathParameters`. A named stage is served under
its own path segment, and stage selection runs before route selection, so the routes never see the
stage name.

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

srv.close();
```

That handler reports four fields of its event, so the response body it produces is:

```json
{
  "routeKey": "GET /pets/{petId}",
  "rawPath": "/dev/pets/6",
  "stage": "dev",
  "petId": "6"
}
```

`rawPath` and `requestContext.http.path` keep the stage segment, while `routeKey` and
`pathParameters` come from the path the routes matched, which is `/pets/6`. The stage prefix in the
path is corroborated by the documented `$context.path` access log variable, "the request path, for
example `/{stage}/root/child`", rather than by the payload format page.

A stage name is `$default`, or up to 128 alphanumerics, hyphens and underscores. The `$default` stage
is served at the root of the endpoint instead of under a name, and both kinds can exist on one API at
once. An explicit stage match wins over any route match: with a `$default` stage and a stage named
`pets`, a request for `/pets/dog` is served by the stage `pets` on the route path `/dog`. A request
reaching an API with no stage for it, and no `$default` stage, is a 404.

`pathParameters` is left out of the event entirely when the matched route captured nothing, including
on a `$default` match. `StageVariables` set on the stage arrive as `event.stageVariables`, and are
left out the same way when the stage has none.

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

## CloudFormation

[Simulated CloudFormation](../cloudformation/ "Simulated CloudFormation docs") deploys
`AWS::ApiGatewayV2::Api`, `AWS::ApiGatewayV2::Integration`, `AWS::ApiGatewayV2::Route` and
`AWS::ApiGatewayV2::Stage`, so a synthesized or hand-written template produces an API that serves
requests.

`Ref` and `Fn::GetAtt` return what real CloudFormation returns for each type:

| Resource type | `Ref`              | `Fn::GetAtt`                |
| ------------- | ------------------ | --------------------------- |
| `Api`         | the API id         | `ApiId`, `ApiEndpoint`      |
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

srv.close();
```

Every property outside the simulated set is refused by name, and the refusal fails the stack. The
simulated properties are:

- `Api`: `Name`, `ProtocolType`, `Description`, `DisableExecuteApiEndpoint`
- `Integration`: `ApiId`, `IntegrationType`, `IntegrationUri`, `PayloadFormatVersion`, `Description`
- `Route`: `ApiId`, `RouteKey`, `Target`, `AuthorizationType`
- `Stage`: `ApiId`, `StageName`, `AutoDeploy`, `StageVariables`, `Description`

`AWS::ApiGatewayV2::Authorizer`, `Deployment`, `DomainName`, `ApiMapping`, `VpcLink` and the
WebSocket-only `Model`, `RouteResponse` and `IntegrationResponse` create nothing, so a template
carrying one has that resource skipped rather than deployed. A route pointing at a skipped authorizer
through `AuthorizerId` fails the stack instead, naming both the route and the authorizer, because
that route would be open here and closed on AWS.

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
- `CreateRoute` and `GetRoutes`, with route keys parsed and validated at creation, and requests
  matched to a route by method, literal segment, `{name}` parameter, `{proxy+}` parameter and
  `$default`
- Path parameters captured by the matched route, reaching the handler as `event.pathParameters`
- `CreateStage` and `GetStages` for the `$default` stage and for named stages served under their own
  path segment, including stage variables
- Serving the generated endpoint through `serveSimAws`, invoking the integrated function with a
  payload format 2.0 event and turning its result back into an HTTP response
- The integration's invoke permission, evaluated against the function's resource policy with the
  matched route supplied as `AWS:SourceArn`
- `DisableExecuteApiEndpoint`, refusing requests to the generated endpoint
- Deployment of `AWS::ApiGatewayV2::Api`, `Integration`, `Route` and `Stage` from a CloudFormation
  template, including one synthesized by CDK from an `HttpApi`
- Authorization of every command by simulated IAM, against the HTTP method and resource path real
  API Gateway uses
- SDK interception of an `ApiGatewayV2Client`

## Limitations

Current documented limitations:

- HTTP APIs only. `ProtocolType: "WEBSOCKET"` is refused.
- Two of the route selection rules, and the place of the method comparison in the order, are observed
  rather than published by AWS. See [Which route serves a request](#which-route-serves-a-request).
- A route path naming the same parameter twice, such as `GET /pets/{id}/toys/{id}`, is refused. This
  is stricter than AWS is known to be: it was refused because only one of the two captures could
  reach the handler, not because real API Gateway was seen to refuse it.
- Deployments are not simulated, so `CreateStage` requires `AutoDeploy: true`. A stage without it
  serves whichever Deployment it was given, which on real AWS is nothing until one is created.
- `RouteSettings`, `DefaultRouteSettings` and `AccessLogSettings` on a stage are refused, as is any
  other option `CreateStage` takes and this one does not.
- `AWS_PROXY` is the only integration type, and its URI must be an unqualified Lambda function ARN.
  A version or alias qualifier is refused, since simulated Lambda has no versions. HTTP proxy
  integrations and AWS service integrations are not simulated.
- Payload format 1.0 is refused. A handler written for 1.0 reads event fields a 2.0 event does not
  have, so treating one as the other would pass here and fail on AWS.
- `AuthorizationType: "NONE"` only. JWT authorizers, `AWS_IAM` routes and Lambda authorizers are not
  simulated, so a route is open here that would be closed on AWS if it asked for one. The route is
  refused rather than created open.
- The method and path segments of the source ARN are inferred rather than documented. See
  [Granting the API permission to invoke the function](#granting-the-api-permission-to-invoke-the-function).
- An integration `CredentialsArn`, the IAM Role alternative to a resource policy grant, is refused
  by `CreateIntegration`. A permission on the function is the only way to admit the invocation.
- No `Update*` commands, and no per-resource `Delete*`. A route, integration or stage is changed by
  deleting its API and creating it again. `DeleteApi` deletes everything under the API, as it does on
  AWS.
- Custom domain names and API mappings are not simulated. They change what `rawPath` holds, so an API
  reached through one behaves differently on AWS from what is served here.
- No paging. `MaxResults` and `NextToken` are refused rather than ignored, and every list command
  answers in full.
- `CorsConfiguration` and `Tags` are refused, as is the `RouteKey`/`Target` quick-create shorthand on
  `CreateApi`. Anything else the real commands accept and this one does not is refused by name rather
  than dropped.
- `AWS::ApiGatewayV2::Api` refuses `CorsConfiguration` by name rather than accepting it with no
  effect. CORS request handling is not simulated, and a template that configured it would otherwise
  get an API that answered preflight requests here differently from AWS. A CDK stack using
  `corsPreflight` does not deploy.
- `AWS::ApiGatewayV2::Api` refuses `Body` and `BodyS3Location` by name. Importing an OpenAPI document
  is a second way to declare routes and integrations, and none of that translation is simulated.
- Stack updates and deletes are not supported for these resource types, as they are not for any
  others. See the [CloudFormation limitations](../cloudformation/#limitations).
- Access logging, throttling, usage plans and API keys are not simulated.
- The response an API Gateway endpoint returns itself uses a lower-case `message` field, as a real
  HTTP API does. A Lambda Function URL uses `Message` for the same thing, so the two are not
  interchangeable.
