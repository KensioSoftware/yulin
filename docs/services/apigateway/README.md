# Simulated API Gateway REST APIs

Yulin includes a simulated API Gateway v1 service, reachable as `simAws.apiGateway()`. It covers the
REST API resource tree, the methods declared on it, a Lambda proxy integration behind each method,
and the deployments and stages that publish them. REST-API-specific types are imported from the
`@kensio/yulin/apigateway` subpath.

This is the v1 service. HTTP APIs are v2, on a separate SDK client, and they are documented under
[API Gateway HTTP APIs](../apigatewayv2/). The two hold separate state. A REST API created here
stays out of `simAws.apiGatewayV2()`.

A handler behind a REST API can be tested against a real HTTP request, with no hand-built event to
keep in step.

## Creating a REST API

`CreateRestApiCommand` creates a REST API together with the root resource every path hangs off.

```typescript sim-apigateway-create-rest-api
/**
 * Creating a simulated API Gateway REST API.
 *
 * The root resource is created with the API, and `rootResourceId` is what the
 * first `CreateResource` names as its parent.
 */

import { CreateRestApiCommand } from "@aws-sdk/client-api-gateway";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const apiGateway = simAws
  .account("555555555555")
  .region("eu-west-2")
  .apiGateway();

const created = await apiGateway.createRestApi(
  new CreateRestApiCommand({ name: "orders", description: "The orders API" }),
);

console.log(created.name);
// "orders"

console.log(typeof created.id);
// "string"

console.log(typeof created.rootResourceId);
// "string"
```

A REST API name identifies nothing. Two APIs in one account and region may share a name, and the id
is what tells them apart. Hold the id the create returns.

## Building the path tree

A REST API path is a chain of resources, each holding one segment. `CreateResourceCommand` adds a
segment under a parent and reports the full path its place in the tree gives it.

```typescript sim-apigateway-resource-tree
/**
 * Building /orders/{orderId} out of two resources.
 *
 * Each resource holds one segment and names its parent, and API Gateway
 * computes the full path from where the resource sits.
 */

import {
  CreateResourceCommand,
  CreateRestApiCommand,
  GetResourcesCommand,
} from "@aws-sdk/client-api-gateway";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const apiGateway = simAws.apiGateway();

const api = await apiGateway.createRestApi(
  new CreateRestApiCommand({ name: "orders" }),
);

const orders = await apiGateway.createResource(
  new CreateResourceCommand({
    restApiId: api.id,
    parentId: api.rootResourceId,
    pathPart: "orders",
  }),
);

await apiGateway.createResource(
  new CreateResourceCommand({
    restApiId: api.id,
    parentId: orders.id,
    pathPart: "{orderId}",
  }),
);

const listed = await apiGateway.getResources(
  new GetResourcesCommand({ restApiId: api.id }),
);

console.log(listed.items.map((resource) => resource.path));
// [ "/", "/orders", "/orders/{orderId}" ]
```

A segment is a literal such as `orders`, a path parameter such as `{orderId}`, or a greedy path
parameter such as `{proxy+}`. A greedy segment matches the rest of the request path. A resource
holding one therefore takes no children, and adding under it is refused.

Deleting a resource deletes everything under it, the way real API Gateway does. The root resource
stays, because every REST API has one.

## Methods and their integrations

A method is declared on a resource with `PutMethodCommand`, and what it does with a request goes
behind it with `PutIntegrationCommand`. Both address the same resource id and HTTP method, since a
REST API method has no id of its own.

```typescript sim-apigateway-method-integration
/**
 * Declaring an ANY method on a greedy resource and putting a Lambda proxy
 * integration behind it, which is the shape a CDK LambdaRestApi produces.
 */

import {
  CreateResourceCommand,
  CreateRestApiCommand,
  GetMethodCommand,
  PutIntegrationCommand,
  PutMethodCommand,
} from "@aws-sdk/client-api-gateway";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const apiGateway = simAws.apiGateway();

const api = await apiGateway.createRestApi(
  new CreateRestApiCommand({ name: "orders" }),
);
const proxy = await apiGateway.createResource(
  new CreateResourceCommand({
    restApiId: api.id,
    parentId: api.rootResourceId,
    pathPart: "{proxy+}",
  }),
);

await apiGateway.putMethod(
  new PutMethodCommand({
    restApiId: api.id,
    resourceId: proxy.id,
    httpMethod: "ANY",
    authorizationType: "NONE",
  }),
);

await apiGateway.putIntegration(
  new PutIntegrationCommand({
    restApiId: api.id,
    resourceId: proxy.id,
    httpMethod: "ANY",
    type: "AWS_PROXY",
    // API Gateway always calls a Lambda integration with POST, whatever
    // method the client used.
    integrationHttpMethod: "POST",
    uri:
      "arn:aws:apigateway:eu-west-2:lambda:path/2015-03-31/functions/" +
      "arn:aws:lambda:eu-west-2:111111111111:function:orders/invocations",
  }),
);

const method = await apiGateway.getMethod(
  new GetMethodCommand({
    restApiId: api.id,
    resourceId: proxy.id,
    httpMethod: "ANY",
  }),
);

console.log(method.methodIntegration?.uri);
// "arn:aws:apigateway:eu-west-2:lambda:path/2015-03-31/functions/
//   arn:aws:lambda:eu-west-2:111111111111:function:orders/invocations",
// echoed back as one line, the way it was configured
```

The integration URI is written either as the bare function ARN, which CDK emits, or wrapped in the
API Gateway invoke path above, which CloudFormation templates and OpenAPI documents emit. Both reach
the same function, and the string is echoed back as it was configured, the way real API Gateway does.
A version or alias qualifier on the end of the ARN is kept. An integration built on an alias
therefore follows that alias.

Deleting a method deletes its integration, because a REST API integration is part of the method.

## Deployments and stages

A REST API has an invocation URL once a stage exists, and every stage is the first path segment of
that URL. An HTTP API can serve a `$default` stage at the root, and a REST API always carries the
segment.

```typescript sim-apigateway-deploy-stage
/**
 * Publishing an API to a stage, and building the URL a request to it goes to.
 *
 * `CreateDeployment` with a `stageName` is the one-call form. Without it the
 * deployment is created and a `CreateStage` points at it separately. Deploying
 * again to a stage that is already there points that stage at the new
 * deployment, which is what every release after the first does.
 */

import {
  CreateDeploymentCommand,
  CreateRestApiCommand,
  GetStageCommand,
} from "@aws-sdk/client-api-gateway";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const apiGateway = simAws
  .account("555555555555")
  .region("eu-west-2")
  .apiGateway();

const api = await apiGateway.createRestApi(
  new CreateRestApiCommand({ name: "orders" }),
);

const deployment = await apiGateway.createDeployment(
  new CreateDeploymentCommand({
    restApiId: api.id,
    stageName: "prod",
    variables: { catalogue: "v2" },
  }),
);

const stage = await apiGateway.getStage(
  new GetStageCommand({ restApiId: api.id, stageName: "prod" }),
);

console.log(stage.deploymentId === deployment.id);
// true

const restApi = apiGateway.findRestApi(api.id);
console.log(restApi?.invokeUrl("prod"));
// "https://<api-id>.execute-api.eu-west-2.amazonaws.com/prod"
```

`invokeUrl` is a simulator accessor. Real API Gateway reports no endpoint for a REST API and leaves
callers to build the URL themselves. CDK's `RestApi.urlForPath` builds the same one.

Real API Gateway freezes the resources and methods into a deployment, and an edit made afterwards
reaches no client until another deployment is created. Here a stage serves the API's current
resources. A test that edits a method sees the change straight away, with no redeployment in
between. That is the one place this departs from AWS.

## Serving a request

A request to the stage's invoke URL walks the resource tree to a method and invokes that method's
integration, and the handler's response becomes the HTTP response.

```typescript sim-apigateway-serve
/**
 * Serving a request through a REST API to its Lambda proxy integration.
 *
 * The handler reads the payload format 1.0 event a REST API sends, which is
 * the older of the two formats and the only one a REST API uses.
 */

import { SimAws } from "@kensio/yulin";
import { simRestApiLambdaProxyFactory } from "@kensio/yulin/apigateway";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const restApi = await simRestApiLambdaProxyFactory.make(
  {
    resourcePaths: ["/orders/{orderId}"],
    handler: (event) => ({
      statusCode: 200,
      headers: { "content-type": "text/plain" },
      body: `order ${event.pathParameters?.["orderId"] ?? "none"}`,
    }),
  },
  simAws,
);

const srv = await serveSimAws({ simAws });

const response = await fetch(
  srv.localUrl(`${restApi.invokeUrl("prod")}/orders/6`),
);

console.log(response.status);
// 200

console.log(await response.text());
// "order 6"

await srv.close();
```

`simRestApiLambdaProxyFactory` builds the function, the resources, the method, the integration, the
invoke permission and the deployment in one call. A test about serving wants all of them and is
about none of them. A test about the commands themselves sends them one at a time.

### The event a handler receives

A REST API sends payload format 1.0. It carries both a single-value and a multi-value map for the
headers and the query string, and it sends `null` for an empty map where format 2.0 omits the field:

| Field                                                      | Empty case |
| ---------------------------------------------------------- | ---------- |
| `queryStringParameters`, `multiValueQueryStringParameters` | `null`     |
| `pathParameters`, `stageVariables`                         | `null`     |
| `body`                                                     | `null`     |

`resource` is the template the path matched, such as `/orders/{orderId}`, and `path` is the path the
client asked for, stage segment and all. A handler behind a `{proxy+}` reads `resource` to tell which
template caught its request.

Each format's handler reads the other format's event wrongly. One function behind both an HTTP API
and a REST API therefore has to pick a side.

### The response a handler returns

A REST API proxy integration takes one shape. A result carrying a numeric `statusCode` becomes the
response, and `multiValueHeaders` sends a header more than once. Anything else is a 502 with
`Internal server error`. That is what real API Gateway answers when it cannot read the integration
response. Payload format 2.0 is the lenient one, wrapping an unrecognised value in a 200, and a
handler relying on that behaves differently here for the same reason it does on AWS.

### Answers when the request matches nothing

| Case                                          | Answer                             |
| --------------------------------------------- | ---------------------------------- |
| A stage the API does not serve                | 403 `Forbidden`                    |
| A path or method the stage has no entry for   | 403 `Missing Authentication Token` |
| The generated endpoint switched off           | 403 `Forbidden`                    |
| No integration, no function, or no permission | 502 `Internal server error`        |
| The handler threw                             | 502 `Internal server error`        |

`Missing Authentication Token` is the wording real API Gateway is well known for. It answers a path
that matched nothing just as much as one that needed credentials.

### The invoke permission

A method's integration runs once the function's resource policy allows
`apigateway.amazonaws.com` to invoke it, exactly as on AWS. The method the request matched is
supplied as `AWS:SourceArn`, in the form
`arn:aws:execute-api:{region}:{account}:{apiId}/{stage}/{METHOD}/{resourcePath}`. A permission
granted for one method therefore leaves the others closed. CDK wildcards the stage, method and path segments,
which admits every method of the API.

## Intercepting an SDK client

`SimSdk` routes `@aws-sdk/client-api-gateway` commands to the simulation. Code under test builds its
own client and reaches simulated API Gateway through it.

```typescript sim-apigateway-sdk-interception
/**
 * Reaching simulated API Gateway through a real APIGatewayClient.
 */

import {
  APIGatewayClient,
  CreateRestApiCommand,
  GetRestApisCommand,
} from "@aws-sdk/client-api-gateway";

import { SimAws } from "@kensio/yulin";
import { SimSdk } from "@kensio/yulin/sdk";

const simAws = new SimAws();
using simSdk = new SimSdk({ simAws });

const client = new APIGatewayClient({ region: "eu-west-2" });
simSdk.intercept(client);

await client.send(new CreateRestApiCommand({ name: "orders" }));

const listed = await client.send(new GetRestApisCommand({}));
console.log(listed.items?.map((restApi) => restApi.name));
// [ "orders" ]
```

The client's region decides which simulated account and region scope the API lands in, the same way
it does for every other intercepted service.

## Authorization

Every command is authorized by simulated IAM, and API Gateway asks IAM an unusual question. The
action is the HTTP method of the underlying REST call, `apigateway:POST` and friends, and the
resource is the request path. `CreateResource` on API `a1b2c3d4e5` asks whether the caller may
`apigateway:POST` on `arn:aws:apigateway:eu-west-2::/restapis/a1b2c3d4e5/resources`. Those ARNs
carry no account id, because API Gateway control-plane ARNs leave that segment empty.

A policy naming an action such as `apigateway:CreateResource` matches nothing here, and it matches
nothing on real AWS.

## What is refused

An input outside what this simulates is refused. Dropping it would let a request look applied here
and behave differently deployed. The refusals worth knowing about:

- **Authorizers.** `authorizationType` other than `NONE` is refused. `TOKEN`, `REQUEST`,
  `COGNITO_USER_POOLS` and `AWS_IAM` methods are a separate piece of work.
- **Integration types.** Only `AWS_PROXY` with a Lambda function URI is simulated. `MOCK`, `HTTP`,
  `HTTP_PROXY` and the non-proxy `AWS` type each answer a request from somewhere this cannot reach.
- **API keys and usage plans.** `apiKeyRequired: true` is refused, because a method requiring a key
  here would answer requests real AWS rejects.
- **Paging.** Every list command answers in full, and `limit` or `position` is refused.
- **Endpoint types, request validators, models, mapping templates and WAF.** All refused.
- **Updates.** `UpdateRestApi` replaces `/name` and `/description`. Any other patch path is refused.

## Available functionality

| Area         | Commands                                                                       |
| ------------ | ------------------------------------------------------------------------------ |
| REST APIs    | `CreateRestApi`, `GetRestApi`, `GetRestApis`, `UpdateRestApi`, `DeleteRestApi` |
| Resources    | `CreateResource`, `GetResource`, `GetResources`, `DeleteResource`              |
| Methods      | `PutMethod`, `GetMethod`, `DeleteMethod`                                       |
| Integrations | `PutIntegration`, `GetIntegration`                                             |
| Publishing   | `CreateDeployment`, `CreateStage`, `GetStage`, `GetStages`, `DeleteStage`      |

## Limitations

- CloudFormation and CDK deployment of `AWS::ApiGateway::*` resources is still to come.
- A repeated request header reaches the handler as one joined value in `multiValueHeaders`, because
  that is the form the platform's `Headers` hands over. Real API Gateway reports each separately.
- Binary media types negotiated by `Accept`, CORS preflight and gateway responses are outside this.
  A response body is still base64 decoded when the handler says `isBase64Encoded`.
- WebSocket APIs are outside this and outside the v2 service.
