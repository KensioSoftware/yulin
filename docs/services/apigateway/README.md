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

## Authorizing a method

A method is open unless it names an authorizer. `CreateAuthorizerCommand` creates one, and
`PutMethodCommand` binds it to a method with `authorizationType: "CUSTOM"` and the `authorizerId` the
API allocated.

A `TOKEN` authorizer reads one header and sends its value to a Lambda function of its own. That
function answers an IAM policy document, evaluated for `execute-api:Invoke` against the ARN of the
request being made. Whatever `context` it returns reaches the handler.

A `REQUEST` authorizer sends the whole request to its function (see
[A REQUEST authorizer](#a-request-authorizer)), so it can identify a caller by several headers
together or by the query string. It answers the same policy document.

```typescript sim-apigateway-token-authorizer
/**
 * Gating a REST API method with a TOKEN Lambda authorizer.
 *
 * The authorizer reads the Authorization header, and the policy it answers is
 * evaluated against the ARN of the request being made.
 */

import { SimAws } from "@kensio/yulin";
import { simRestApiLambdaProxyFactory } from "@kensio/yulin/apigateway";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const restApi = await simRestApiLambdaProxyFactory.make(
  {
    resourcePaths: ["/orders"],
    authorizerHandler: (event) => ({
      principalId: "user-6",
      context: { tenantId: "acme" },
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Action: "execute-api:Invoke",
            Effect:
              event.authorizationToken === "Bearer valid" ? "Allow" : "Deny",
            Resource: event.methodArn,
          },
        ],
      },
    }),
    handler: (event) => ({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event.requestContext.authorizer),
    }),
  },
  simAws,
);

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${restApi.invokeUrl("prod")}/orders`);

const admitted = await fetch(url, {
  headers: { authorization: "Bearer valid" },
});

console.log(admitted.status);
// 200

console.log(await admitted.text());
// '{"tenantId":"acme","principalId":"user-6"}'

const refused = await fetch(url, {
  headers: { authorization: "Bearer stale" },
});

console.log(refused.status);
// 403

const anonymous = await fetch(url);

console.log(anonymous.status);
// 401

await srv.close();
```

`simRestApiLambdaProxyFactory` builds the authorizer's function, the authorizer, its invoke
permission and the methods bound to it when it is given an `authorizerHandler`.

### The event the authorizer receives

A `TOKEN` authorizer sees three fields and no more.

| Field                | What it carries                                                          |
| -------------------- | ------------------------------------------------------------------------ |
| `type`               | The literal `TOKEN`                                                      |
| `authorizationToken` | The value the request carried at the identity source                     |
| `methodArn`          | `arn:aws:execute-api:{region}:{account}:{apiId}/{stage}/{METHOD}/{path}` |

The `methodArn` names the path the client asked for rather than the resource template it matched. A
request to `/orders/6` behind an `/orders/{orderId}` resource is named as `GET/orders/6`.

A `TOKEN` authorizer's identity source is one header, written as
`method.request.header.Authorization`. An expression naming anywhere else is refused by
`CreateAuthorizer`, because an authorizer that looks where the request never carries anything
refuses everyone. That refusal reads like a signing problem when the configuration is what went
wrong.

### A REQUEST authorizer

`type: "REQUEST"` sends the request itself to the function. The `identitySource` is one
comma-separated string naming as many places as identify a caller, in the
`method.request.header.<name>` and `method.request.querystring.<name>` forms. An HTTP API takes a
list here, and a REST API takes the string.

```typescript sim-apigateway-request-authorizer
/**
 * Gating a REST API method with a REQUEST Lambda authorizer.
 *
 * The authorizer reads a header and a query string parameter together, which
 * is what a TOKEN authorizer cannot do.
 */

import { SimAws } from "@kensio/yulin";
import { simRestApiLambdaProxyFactory } from "@kensio/yulin/apigateway";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const restApi = await simRestApiLambdaProxyFactory.make(
  {
    resourcePaths: ["/orders"],
    httpMethod: "GET",
    authorizerIdentitySource:
      "method.request.header.X-Tenant,method.request.querystring.plan",
    requestAuthorizerHandler: (event) => ({
      principalId: event.headers["x-tenant"],
      context: { plan: event.queryStringParameters["plan"] },
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Action: "execute-api:Invoke",
            Effect:
              event.queryStringParameters["plan"] === "gold" ? "Allow" : "Deny",
            Resource: event.methodArn,
          },
        ],
      },
    }),
    handler: (event) => ({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event.requestContext.authorizer),
    }),
  },
  simAws,
);

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${restApi.invokeUrl("prod")}/orders`).href;
const headers = { "x-tenant": "acme" };

const admitted = await fetch(`${url}?plan=gold`, { headers });

console.log(admitted.status);
// 200

console.log(await admitted.text());
// '{"plan":"gold","principalId":"acme"}'

const refused = await fetch(`${url}?plan=free`, { headers });

console.log(refused.status);
// 403

const anonymous = await fetch(`${url}?plan=gold`);

console.log(anonymous.status);
// 401

await srv.close();
```

The function is invoked only once the request carries something at every identity source. The
request with no `X-Tenant` header above got its 401 without the function running.

An authorizer created with no `identitySource` is refused. Real AWS invokes that authorizer for
every request including one carrying nothing, and CDK's `RequestAuthorizer` requires at least one
source.

#### The event a REQUEST authorizer receives

The event is the payload format 1.0 request event with `type` and `methodArn` added and the body
left out.

| Field                                                      | What it carries                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| `type`                                                     | The literal `REQUEST`                                          |
| `methodArn`                                                | The ARN of the request, the same one a `TOKEN` authorizer gets |
| `resource`, `path`, `httpMethod`                           | The resource template, the path asked for and the method       |
| `headers`, `multiValueHeaders`                             | The request headers, in both forms payload format 1.0 sends    |
| `queryStringParameters`, `multiValueQueryStringParameters` | The query string, in both forms                                |
| `pathParameters`, `stageVariables`                         | What the resource path captured, and the stage's variables     |
| `requestContext`                                           | The same block a handler gets, without the `authorizer` member |

The maps are empty objects where the request supplied nothing. An integration event sends `null`
there, and AWS's own example of the authorizer event sends `{}`, so a function reading
`event.queryStringParameters.plan` finds nothing rather than throwing.

### Answering with a policy

A REST API authorizer always answers a policy. An HTTP API authorizer may answer a boolean instead.
A function written for one is read wrongly by the other.

```json
{
  "principalId": "user-6",
  "context": { "tenantId": "acme" },
  "policyDocument": {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Action": "execute-api:Invoke",
        "Effect": "Allow",
        "Resource": "arn:aws:execute-api:eu-west-2:111111111111:a1b2c3d4e5/prod/GET/orders"
      }
    ]
  }
}
```

The document goes to simulated IAM and is evaluated for `execute-api:Invoke` on the `methodArn`. A
policy naming one method leaves the others unauthorized, and an authorizer wanting to open the whole
API wildcards the resource the way any IAM policy does.

`principalId` is a name the authorizer chose for the caller. It identifies that caller in the
authorizer's own logs, and IAM never sees it.

### The context the handler receives

`context` reaches the handler under `requestContext.authorizer`, flattened alongside `principalId`.
Payload format 2.0 keeps the context in a block of its own, so a handler moved between a REST API and
an HTTP API reads a different shape.

An open method has no caller to describe, and leaves `requestContext.authorizer` out of the event
altogether.

### What a refused request gets back

| Case                                                         | Answer                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| No value at the identity source                              | 401 `Unauthorized`                                                         |
| The authorizer returned `{ "errorMessage": "Unauthorized" }` | 401 `Unauthorized`                                                         |
| A Deny statement matched the method                          | 403 `User is not authorized to access this resource with an explicit deny` |
| The policy allowed nothing covering the method               | 403 `User is not authorized to access this resource`                       |
| The authorizer failed, or answered a shape AWS cannot read   | 500 `Internal server error`                                                |

A request carrying nothing at the identity source is refused before the function is invoked. An
authorizer counting its own invocations never sees one.

The 401 body member is `message` and the 403 one is `Message`. Real API Gateway is inconsistent about
the two and this follows it.

A function that throws is an authorizer failure, and gets the 500. Real Lambda turns a thrown error
into a payload carrying `errorMessage`, while simulated Lambda rejects with the error itself.
Returning the value is the way to ask for a 401.

### The authorizer's invoke permission

The authorizer's function needs a grant of its own, under an ARN naming the authorizer:

```text
arn:aws:execute-api:{region}:{account}:{apiId}/authorizers/{authorizerId}
```

That ARN names no stage. A function used both as an integration and as an authorizer needs two
permissions, as it does on AWS. CDK's `TokenAuthorizer` and `RequestAuthorizer` both write this
one.

### Caching the authorizer's decision

`authorizerResultTtlInSeconds` holds a decision for that many seconds. A second request presenting
the same identity within that period reaches the handler without the function running again. AWS
accepts a whole number of seconds up to 3600, and 0 switches the holding off.

An authorizer that says nothing about the member gets 0 here and gets 300 on real API Gateway.
Write the member out to have a test and a deployment agree on it. CDK writes it either way, at five
minutes by default (see [CDK](#cdk)).

A `TOKEN` authorizer is keyed on the token it was handed. A `REQUEST` authorizer is keyed on the
values its identity sources found, in the order they were configured. Both are held per method,
because what is held is the admission or refusal the authorizer's policy produced for one method
ARN, and that answer covers no other method. (An HTTP API keys on the identity source values alone,
and one decision there covers every route using the authorizer.)

A refusal is held the way an admission is. AWS holds whatever answer the authorizer gave. A failed
authorizer holds no answer, and its function is asked again on the next request.

Expiry follows simulated time. `simAws.clock().advanceBy(...)` drops a decision that was being
reused a moment before.

```typescript sim-apigateway-authorizer-cache
/**
 * Caching a simulated REST API Lambda authorizer's decision.
 *
 * The authorizer counts its own invocations and reports the count in its
 * context, so the handler shows which decision served each request.
 */

import { SimAws } from "@kensio/yulin";
import { simRestApiLambdaProxyFactory } from "@kensio/yulin/apigateway";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const counter = { invocations: 0 };

const restApi = await simRestApiLambdaProxyFactory.make(
  {
    resourcePaths: ["/orders"],
    authorizerResultTtlSeconds: 300,
    authorizerHandler: (event) => {
      counter.invocations += 1;

      return {
        principalId: "user-6",
        context: { ...counter },
        policyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Action: "execute-api:Invoke",
              Effect: "Allow",
              Resource: event.methodArn,
            },
          ],
        },
      };
    },
    handler: (event) => ({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event.requestContext.authorizer),
    }),
  },
  simAws,
);

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${restApi.invokeUrl("prod")}/orders`);
const call = async (): Promise<unknown> => {
  const response = await fetch(url, {
    headers: { authorization: "Bearer session-6" },
  });

  return await response.json();
};

console.log(await call());
// { invocations: 1, principalId: 'user-6' }

console.log(await call());
// { invocations: 1, principalId: 'user-6' }, held rather than asked again

await simAws.clock().advanceBy({ minutes: 6 });

console.log(await call());
// { invocations: 2, principalId: 'user-6' }

await srv.close();
```

A `COGNITO_USER_POOLS` authorizer verifies each token as it arrives here, and `CreateAuthorizer`
refuses `authorizerResultTtlInSeconds` on one. Real API Gateway holds a Cognito authorizer's
decision too, and a token that expires inside the period is still accepted there.

## Protecting a method with IAM

A method declared `authorizationType: "AWS_IAM"` reaches its integration only when the caller is
allowed `execute-api:Invoke` on the ARN of the method being called. IAM decides. The method takes no
authorizer, and naming one is refused by `PutMethod`.

The caller comes from the request, through either a SigV4 signature or an `x-sim-aws-caller` header
naming a principal directly. A request offering neither is anonymous, owns no policies, and is
refused. See [callers of HTTP requests](../iam/#callers-of-http-requests) in the IAM docs for how that
resolution works and how to sign a served request.

The ARN a request is authorized against is:

```text
arn:aws:execute-api:<region>:<account>:<apiId>/<stage>/<METHOD>/<path>
```

- The Account and Region are the API's own, not the caller's.
- The stage is the one that served the request.
- The method is the one the client sent, upper case. A `GET` reaching a resource declaring `ANY`
  gives `GET`.
- The path is the request path with the stage segment and the leading slash taken off, so
  `/prod/orders/42` served from stage `prod` gives `orders/42`. It is the path the client asked for,
  because a policy names it by hand. A request to a method declared on `/orders/{orderId}` is
  authorized under `GET/orders/42`, with no braces in it. A request to the API root gives an ARN
  ending `/GET/`.

An identity policy may wildcard any part of that. `<apiId>/*`, `<apiId>/prod/*` and
`<apiId>/*/GET/orders/*` all allow a `GET` of `/orders/42` on stage `prod`.

```typescript sim-apigateway-iam-authorization
/**
 * Protecting a simulated REST API method with IAM.
 *
 * The caller the request was attributed to has to be allowed
 * execute-api:Invoke on the method it is calling.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimAws } from "@kensio/yulin";
import { simRestApiLambdaProxyFactory } from "@kensio/yulin/apigateway";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const restApi = await simRestApiLambdaProxyFactory.make(
  {
    iamAuthorization: true,
    resourcePaths: ["/orders/{orderId}"],
    handler: (event) => ({
      statusCode: 200,
      headers: { "content-type": "text/plain" },
      body: `orders for ${event.requestContext.identity.userArn ?? "nobody"}`,
    }),
  },
  simAws,
);

// A Role of the API's own Account, allowed to call the orders methods of this
// API on the stage it is deployed to.
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
          Resource: `arn:aws:execute-api:us-east-1:888888888888:${restApi.apiId}/prod/GET/orders/*`,
        },
      ],
    }),
  }),
);

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${restApi.invokeUrl("prod")}/orders/42`);

const anonymous = await fetch(url);

console.log(anonymous.status);
// 403

const reporter = await fetch(url, {
  headers: { "x-sim-aws-caller": "arn:aws:iam::888888888888:role/Reporter" },
});

console.log(await reporter.text());
// "orders for arn:aws:iam::888888888888:role/Reporter"

await srv.close();
```

A caller IAM does not allow gets 403 with `User is not authorized to access this resource`. An
explicit Deny gets that same body, where a Lambda authorizer's Deny gets one of its own.

Only the caller's identity policies are read. A REST API also has a resource policy on real AWS, and
`Policy` on an `AWS::ApiGateway::RestApi` is recorded against the Resource with the API deployed
without it. A caller from another Account is therefore always refused, because a cross-Account
request needs an Allow from each side. The way through, here as on AWS, is to assume a Role in the
API's Account.

### The identity the handler receives

An admitted caller reaches the handler under `requestContext.identity`.

| Field       | What it carries                    |
| ----------- | ---------------------------------- |
| `accountId` | The Account the caller's ARN names |
| `caller`    | The caller's ARN                   |
| `user`      | The caller's ARN                   |
| `userArn`   | The caller's ARN                   |

Real API Gateway puts the unique id of the principal in `caller` and `user`, such as `AIDA...` for a
User. A request carries no such id into the simulation, so the ARN identifying the caller goes in
every field that can be filled from it.

A method of any other authorization type leaves those four `null`, and so does an `AWS_IAM` method
called by a principal with no ARN behind it. `accessKey`, `apiKey`, `apiKeyId`, `principalOrgId` and
the two Cognito identity pool fields are `null` throughout. `sourceIp` and `userAgent` describe the
request itself and are filled for every method.

## Authorizing a method with a user pool

A `COGNITO_USER_POOLS` authorizer verifies the token itself against the keys the user pools it names
publish. Nothing is invoked, so there is no function to write and no policy to answer.
`CreateAuthorizerCommand` takes the pools as `providerARNs`, and `PutMethodCommand` binds the
authorizer to a method with `authorizationType: "COGNITO_USER_POOLS"`.

```typescript sim-apigateway-cognito-authorizer
/**
 * Gating a REST API method with a Cognito user pool authorizer.
 *
 * The authorizer verifies the token against the keys the pool publishes, and
 * the token's own claims reach the handler under `requestContext.authorizer`.
 */

import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";
import { simRestApiLambdaProxyFactory } from "@kensio/yulin/apigateway";
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

const restApi = await simRestApiLambdaProxyFactory.make(
  {
    resourcePaths: ["/orders"],
    cognitoUserPoolArns: [pool.UserPool!.Arn!],
    handler: (event) => ({
      statusCode: 200,
      headers: { "content-type": "text/plain" },
      body: `orders for ${
        event.requestContext.authorizer?.claims?.["cognito:username"] ??
        "nobody"
      }`,
    }),
  },
  simAws,
);

const signedIn = await cognito.adminInitiateAuth(
  new AdminInitiateAuthCommand({
    UserPoolId,
    ClientId,
    AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "ada", PASSWORD: "Correct-horse-1" },
  }),
);
const idToken = signedIn.AuthenticationResult!.IdToken!;

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${restApi.invokeUrl("prod")}/orders`);

const anonymous = await fetch(url);

console.log(anonymous.status);
// 401

const authorized = await fetch(url, { headers: { authorization: idToken } });

console.log(await authorized.text());
// "orders for ada"

// Advancing the simulation's clock past the token's expiry closes the method
// to the same token, with nothing reissued.
await simAws.clock().advanceBy({ hours: 2 });

const expired = await fetch(url, { headers: { authorization: idToken } });

console.log(expired.status);
// 401

await srv.close();
```

`simRestApiLambdaProxyFactory` builds the authorizer and the methods bound to it when it is given
`cognitoUserPoolArns`.

A `providerARN` is read for the pool id it names, and the pool is looked up across every simulated
account. The token is accepted when any one of the named pools signed it, its `iss` names that same
pool, and its time claims hold against the simulation's clock. Advancing the clock past a token's
`exp` therefore closes a method that was open to it.

### The claims the handler receives

The token's own claims reach the handler under `requestContext.authorizer.claims`, and every value
arrives as a string. A list claim such as `cognito:groups` is rendered the way Go prints a slice, so
two groups arrive as `[Admins Readers]`.

```json
{
  "claims": {
    "sub": "5c4a5f6c-6c31-4a2e-9a55-2c4dcb8f2f4f",
    "cognito:username": "ada",
    "cognito:groups": "[Admins Readers]",
    "iss": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_aBcDeFgHi",
    "token_use": "id"
  }
}
```

An HTTP API puts the same claims under `requestContext.authorizer.jwt.claims`, with the scopes
beside them, so a handler moved between the two reads a different shape.

### Scopes

`authorizationScopes` on the method is met by any one of the scopes the token's `scope` claim
carries. The scopes are the method's own, so one authorizer covers methods asking for different
ones.

A method asking for no scope takes an id token and an access token alike, because `token_use` is not
checked, which is what real API Gateway does. A method asking for a scope takes only an access
token, since an id token carries no `scope` claim at all.

### What a refused request gets back

| Case                                                       | Answer                                               |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| No value at the identity source                            | 401 `Unauthorized`                                   |
| A value that is not a readable JWT                         | 401 `Unauthorized`                                   |
| A token no named pool signed, or one signed by another key | 401 `Unauthorized`                                   |
| A token that has expired, or has no `exp` at all           | 401 `Unauthorized`                                   |
| A verified token claiming none of the method's scopes      | 403 `User is not authorized to access this resource` |

Every refusal up to and including the claim checks is the same 401, so a client learns that its
token was not accepted and nothing about which check it failed. An unmet scope is the one 403: the
token was accepted, and it does not allow this method.

The token is taken with or without the `Bearer` scheme in front of it. The identity source is one
header, as it is for a `TOKEN` authorizer.

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

## Importing an OpenAPI definition

`ImportRestApiCommand` takes a serialised OpenAPI 3.0 document and creates the API, the resources of
its path tree, one method per operation and the integration behind each method. Every segment of a
path becomes a resource, and paths sharing a prefix share the nodes that spell it, so
`/pets/{petId}` is a `{petId}` resource under a `pets` one under the root.

An import creates no stage. `CreateDeploymentCommand` or an `AWS::ApiGateway::Stage` is still
declared separately, and an imported API with no stage answers 403.

```typescript sim-apigateway-openapi
/**
 * Creating a simulated REST API from an OpenAPI 3 definition.
 */

import {
  CreateDeploymentCommand,
  GetResourcesCommand,
  ImportRestApiCommand,
} from "@aws-sdk/client-api-gateway";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws, type SimPayload1Event } from "@kensio/yulin/serve";

const simAws = new SimAws();

const { FunctionArn } = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "pets",
    Role: "arn:aws:iam::111111111111:role/PetsRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimPayload1Event) => ({
        statusCode: 200,
        headers: { "content-type": "text/plain" },
        body: `pet ${event.pathParameters?.["petId"] ?? "none"}`,
      })),
    },
  }),
);

const openApi = {
  openapi: "3.0.1",
  info: { title: "pets", version: "1.0" },
  paths: {
    "/pets/{petId}": {
      get: {
        // Ignored, as on AWS, since no request validator names this schema.
        responses: { "200": { description: "200 response" } },
        "x-amazon-apigateway-integration": {
          type: "aws_proxy",
          httpMethod: "POST",
          uri:
            `arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/` +
            `${FunctionArn}/invocations`,
        },
      },
    },
  },
};

const apiGateway = simAws.apiGateway();
const definition = new TextEncoder().encode(JSON.stringify(openApi));

const { id: restApiId } = await apiGateway.importRestApi(
  new ImportRestApiCommand({ body: definition }),
);

const resources = await apiGateway.getResources(
  new GetResourcesCommand({ restApiId }),
);

console.log(resources.items.map((resource) => resource.path));
// [ "/", "/pets", "/pets/{petId}" ]

// An import creates no stage. The API answers 403 until one is deployed.
await apiGateway.createDeployment(
  new CreateDeploymentCommand({ restApiId, stageName: "prod" }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "pets",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${restApiId}/*/*/*`,
  }),
);

const srv = await serveSimAws({ simAws });

const response = await fetch(
  srv.localUrl(
    `https://${restApiId}.execute-api.us-east-1.amazonaws.com/prod/pets/42`,
  ),
);

console.log(await response.text());
// "pet 42"

await srv.close();
```

The API is named by `info.title`. `uri` is read as either the long
`arn:aws:apigateway:<region>:lambda:path/2015-03-31/functions/<function-arn>/invocations` form above
or as the bare function ARN. Every imported method is declared with `AuthorizationType: "NONE"`, and
a document naming an authorizer is refused. Gate a method with `CreateAuthorizer` and `PutMethod`
instead, as [Authorizing a method](#authorizing-a-method) covers.

### The catch-all operation key

`x-amazon-apigateway-any-method` declares an `ANY` method on the path. That method serves every verb
the resource has no method of its own for, and OpenAPI has no operation key of its own for it:

```json
{
  "/pets": {
    "x-amazon-apigateway-any-method": {
      "x-amazon-apigateway-integration": { "type": "aws_proxy", "uri": "..." }
    }
  }
}
```

A `{proxy+}` segment becomes a greedy resource that matches the rest of the request path. One path
of `/{proxy+}` carrying that extension is the whole of what CDK's `LambdaRestApi` builds.

### Members that are ignored

AWS sorts what an import finds into three categories, and the third is valid OpenAPI a REST API
leaves unsupported without a request validator. AWS ignores it silently, and so does this:
`requestBody`, the content schemas under `responses`, `components.schemas`, and an operation's
`parameters`, `summary`, `description` and `tags`. Request validation is refused at the root of the
document, so a request whose body contradicts a declared schema still reaches the handler.
`operationId` is ignored too, since it only supplies the `OperationName` a method carries for
documentation.

Everything else the document carries and this simulation cannot apply is refused, naming the JSON
pointer of the member, such as
`#/paths/~1pets~1{petId}/get/x-amazon-apigateway-integration/passthroughBehavior`.

### Replacing a definition

`PutRestApiCommand` with `mode: "overwrite"` replaces an API's whole definition with the document's.
The API keeps its id, its endpoint and the stages serving it, and its path tree is built again from
the document.

```typescript
await apiGateway.putRestApi(
  new PutRestApiCommand({ restApiId, mode: "overwrite", body: definition }),
);
```

`mode: "merge"` is refused, and so is a `PutRestApi` that leaves the mode out, which AWS reads as a
merge. A merge adds the document's paths to the API's existing ones, and which of two declarations
of one method it keeps decides what every request to that method reaches.

A refused replacement leaves the API with an empty path tree. The old definition has already been
taken out by the time a member deep in the document is refused, and an API serving nothing is
clearer than one serving half of each document.

## Deploying from CloudFormation and CDK

[Simulated CloudFormation](../cloudformation/ "Simulated CloudFormation docs") deploys
`AWS::ApiGateway::RestApi`, `AWS::ApiGateway::Resource`, `AWS::ApiGateway::Method`,
`AWS::ApiGateway::Deployment` and `AWS::ApiGateway::Stage`. A synthesized or hand-written template
produces an API that serves requests.

`Ref` and `Fn::GetAtt` return what real CloudFormation returns for each type:

| Resource type | `Ref`             | `Fn::GetAtt`                  |
| ------------- | ----------------- | ----------------------------- |
| `RestApi`     | the API id        | `RestApiId`, `RootResourceId` |
| `Resource`    | the resource id   | `ResourceId`                  |
| `Method`      | the logical id    | none, as AWS documents none   |
| `Deployment`  | the deployment id | `DeploymentId`                |
| `Stage`       | the stage name    | none, as AWS documents none   |

A REST API method has no id of its own. It is addressed by its API, its resource and its HTTP verb,
and a `Ref` to one falls back on the CloudFormation logical id. CDK reads that value only to publish
`Method.methodId`.

The API publishes no endpoint attribute either, because real API Gateway reports none. CDK joins the
URL out of a `Ref` to the API, the region, `AWS::URLSuffix` and a `Ref` to the stage. That suffix
resolves to the local `sim-aws.localhost` hostname, and the stage is the first path segment of what
it builds.

A `Resource` names its place in the tree through `ParentId`. The top of the tree reads
`Fn::GetAtt: ["<Api>", "RootResourceId"]`, and everything below it a `Ref` to the node above.

A `Method` carries its integration as an `Integration` block of its own, which is how the REST API
models one. The block becomes the `PutIntegration` that follows the method's `PutMethod`, and its
`Uri` is read as the bare Lambda function ARN or as the
`arn:aws:apigateway:<region>:lambda:path/2015-03-31/functions/<function-arn>/invocations` string CDK
builds with `Fn::Join`.

```typescript sim-apigateway-cloudformation
/**
 * Deploying a simulated REST API from a CloudFormation template.
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
              "exports.handler = async (event) => ({ statusCode: 200, body: 'order ' + event.pathParameters.orderId });",
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
                "arn:aws:execute-api:",
                { Ref: "AWS::Region" },
                ":",
                { Ref: "AWS::AccountId" },
                ":",
                { Ref: "Api" },
                "/*/*/*",
              ],
            ],
          },
        },
      },
      Api: {
        Type: "AWS::ApiGateway::RestApi",
        Properties: { Name: "orders" },
      },
      OrdersResource: {
        Type: "AWS::ApiGateway::Resource",
        Properties: {
          RestApiId: { Ref: "Api" },
          ParentId: { "Fn::GetAtt": ["Api", "RootResourceId"] },
          PathPart: "orders",
        },
      },
      OrderResource: {
        Type: "AWS::ApiGateway::Resource",
        Properties: {
          RestApiId: { Ref: "Api" },
          ParentId: { Ref: "OrdersResource" },
          PathPart: "{orderId}",
        },
      },
      GetOrder: {
        Type: "AWS::ApiGateway::Method",
        Properties: {
          RestApiId: { Ref: "Api" },
          ResourceId: { Ref: "OrderResource" },
          HttpMethod: "GET",
          AuthorizationType: "NONE",
          Integration: {
            Type: "AWS_PROXY",
            IntegrationHttpMethod: "POST",
            Uri: {
              "Fn::Join": [
                "",
                [
                  "arn:aws:apigateway:",
                  { Ref: "AWS::Region" },
                  ":lambda:path/2015-03-31/functions/",
                  { "Fn::GetAtt": ["Handler", "Arn"] },
                  "/invocations",
                ],
              ],
            },
          },
        },
      },
      Deployment: {
        Type: "AWS::ApiGateway::Deployment",
        Properties: { RestApiId: { Ref: "Api" } },
        DependsOn: ["GetOrder"],
      },
      Stage: {
        Type: "AWS::ApiGateway::Stage",
        Properties: {
          RestApiId: { Ref: "Api" },
          DeploymentId: { Ref: "Deployment" },
          StageName: "prod",
        },
      },
    },
    Outputs: {
      ApiUrl: {
        Value: {
          "Fn::Join": [
            "",
            [
              "https://",
              { Ref: "Api" },
              ".execute-api.",
              { Ref: "AWS::Region" },
              ".",
              { Ref: "AWS::URLSuffix" },
              "/",
              { Ref: "Stage" },
              "/",
            ],
          ],
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

// https://<api-id>.execute-api.us-east-1.sim-aws.localhost/prod/
const apiUrl = stack.output("ApiUrl");

const srv = await serveSimAws({ simAws });

const response = await fetch(srv.localUrl(`${apiUrl}orders/6`));

console.log(response.status);
// 200

console.log(await response.text());
// "order 6"

await srv.close();
```

Every property outside the simulated set is left out of what is created and recorded in
[`stack.ignoredProperties`](../cloudformation/README.md#properties-a-resource-was-created-without),
naming the Resource type, the logical id and the ones this can act on. The API, resource, method,
deployment or stage is created either way. The stack deploys, and the record says which of its parts
behaves differently to the template. The simulated properties are:

- `RestApi`: `Name`, `Description`, `DisableExecuteApiEndpoint`, `Body`, `FailOnWarnings`
- `Resource`: `RestApiId`, `ParentId`, `PathPart`
- `Method`: `RestApiId`, `ResourceId`, `HttpMethod`, `AuthorizationType`, `AuthorizerId`,
  `AuthorizationScopes`, `ApiKeyRequired`, `OperationName`, `Integration`
- A method's `Integration` block: `Type`, `IntegrationHttpMethod`, `Uri`
- `Authorizer`: `RestApiId`, `Name`, `Type`, `AuthorizerUri`, `ProviderARNs`, `IdentitySource`
- `Deployment`: `RestApiId`, `Description`, `StageName`
- `Stage`: `RestApiId`, `DeploymentId`, `StageName`, `Description`, `Variables`

A `Body` on the `RestApi` is an inline OpenAPI document declaring the API's resources, methods and
integrations. It goes through `ImportRestApi`, the same translator an SDK caller importing a
document reaches, and the template then carries no `Resource` or `Method` of its own. See
[Importing an OpenAPI definition](#importing-an-openapi-definition) for what the document may hold.

```yaml
Api:
  Type: AWS::ApiGateway::RestApi
  Properties:
    Body:
      openapi: 3.0.1
      info: { title: pets, version: "1.0" }
      paths:
        /pets/{petId}:
          get:
            x-amazon-apigateway-integration:
              type: aws_proxy
              httpMethod: POST
              uri: !GetAtt Handler.Arn
```

`Name` names the API where the template carries both, and the document's `info.title` names it
otherwise. `Description` and `DisableExecuteApiEndpoint` beside a `Body` are recorded and left off
the API, because `ImportRestApi` takes neither and AWS applies them in a second step. A
`Resource`, `Method` or other entry adding to an API a `Body` already declared fails the stack
naming both, since the template would then declare the API two ways at once. `BodyS3Location` and
`Mode` are recorded like any other unsimulated property.

A `Body` holding a Swagger 2.0 document is the one document that is recorded instead of refused. The
API deploys with an empty path tree and the record says why. SAM writes Swagger 2.0 for an
`AWS::Serverless::Api` unless the template asks for `OpenApiVersion: 3.0.1`, and failing the stack
over the version of a document would take a whole SAM API down with it. Every other document the
import refuses fails the Resource, because an API deployed with an empty tree answers 403 for every
path the document declared.

`StageName` on a `Deployment` is the older one-Resource form, where the deployment publishes a stage
of that name by itself and the template carries one Resource fewer.

### SAM

A template naming the SAM transform reaches the same resource types.
`AWS::Serverless::Api` becomes a REST API with its deployment and stage, and the `Api` event of an
`AWS::Serverless::Function` becomes the path resources, the method and the invoke permission that
put the function behind it. Events naming no `RestApiId` share one API on a `Prod` stage.
[The SAM section of the CloudFormation docs](../cloudformation/README.md#rest-apis) covers both.

### CDK

CDK's `RestApi` and `LambdaRestApi` both deploy and serve. `LambdaRestApi` synthesizes an `ANY`
method on the root and another on a `{proxy+}` resource, both in front of one function, with the
`AWS::Lambda::Permission` each needs. `restApi.url` and `restApi.urlForPath` resolve to the local
hostname through `AWS::URLSuffix`.

`TokenAuthorizer` and `RequestAuthorizer` deploy too, with the `AWS::Lambda::Permission` each
writes for its own function. CDK holds a decision for five minutes by default, and
`resultsCacheTtl` sets that period. See
[Caching the authorizer's decision](#caching-the-authorizers-decision).

`CognitoUserPoolsAuthorizer` deploys as it stands, naming the pools it was given by ARN. A method
takes it with `authorizationType: apigateway.AuthorizationType.COGNITO`, and a user pool the same
stack declares is reached through the `Fn::GetAtt` on its ARN that CDK writes.

CDK also writes an `AWS::ApiGateway::Account` and a CloudWatch role beside a default `RestApi`.
Neither is simulated. The `Account` Resource is recorded in
[`stack.skippedResources`](../cloudformation/README.md#inspecting-stacks-and-resources) and the rest of the
stack deploys.

`ApiKey`, `UsagePlan`, `UsagePlanKey`, `RequestValidator`, `Model`, `DomainName` and
`BasePathMapping` are recorded there too, each naming the reason. A method under one of them is
refused by `PutMethod`, because a method that looked gated to the template and answered every
request here is worse than a failed deployment.

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

- **Authorizer kinds.** `CreateAuthorizer` takes `TOKEN`, `REQUEST` and `COGNITO_USER_POOLS`, which
  is every kind a REST API has. The `JWT` authorizer an HTTP API takes is the v2 service's and is
  refused here. An `AWS_IAM` method is decided by IAM and names no authorizer. See
  [Protecting a method with IAM](#protecting-a-method-with-iam).
- **Identity source expressions.** A `REQUEST` authorizer reads
  `method.request.header.<name>` and `method.request.querystring.<name>`. AWS also allows
  `method.request.path`, `context` and `stageVariables`, and each is refused by
  `CreateAuthorizer`.
- **Scopes on a method that checks none.** `authorizationScopes` is refused on a method that is not
  `COGNITO_USER_POOLS`, since a method carrying scopes nothing checks reads as gated by them.
- **Holding a Cognito authorizer's decision.** `authorizerResultTtlInSeconds` is refused on a
  `COGNITO_USER_POOLS` authorizer. Real API Gateway holds that decision, and a token expiring
  during the period would still be accepted. A Lambda authorizer takes the member. See
  [Caching the authorizer's decision](#caching-the-authorizers-decision).
- **The default period.** A Lambda authorizer written with no `authorizerResultTtlInSeconds` holds
  no decision here, where real API Gateway would hold one for 300 seconds. An authorizer counting
  its own invocations counts one per request until the member is written out.
- **Integration types.** Only `AWS_PROXY` with a Lambda function URI is simulated. `MOCK`, `HTTP`,
  `HTTP_PROXY` and the non-proxy `AWS` type each answer a request from somewhere this cannot reach.
- **API keys and usage plans.** `apiKeyRequired: true` is refused, because a method requiring a key
  here would answer requests real AWS rejects.
- **Paging.** Every list command answers in full, and `limit` or `position` is refused.
- **Endpoint types, request validators, models, mapping templates and WAF.** All refused.
- **Updates.** `UpdateRestApi` replaces `/name` and `/description`. Any other patch path is refused.
- **OpenAPI extensions.** An import reads `x-amazon-apigateway-integration` and
  `x-amazon-apigateway-any-method`. Every other `x-amazon-apigateway-*` extension is refused, and so
  is any integration member beyond `type`, `httpMethod` and `uri`. Each refusal names the JSON
  pointer of the member.

## Available functionality

| Area         | Commands                                                                       |
| ------------ | ------------------------------------------------------------------------------ |
| REST APIs    | `CreateRestApi`, `GetRestApi`, `GetRestApis`, `UpdateRestApi`, `DeleteRestApi` |
| OpenAPI      | `ImportRestApi`, `PutRestApi`                                                  |
| Resources    | `CreateResource`, `GetResource`, `GetResources`, `DeleteResource`              |
| Authorizers  | `CreateAuthorizer`, `GetAuthorizer`, `GetAuthorizers`, `DeleteAuthorizer`      |
| Methods      | `PutMethod`, `GetMethod`, `DeleteMethod`                                       |
| Integrations | `PutIntegration`, `GetIntegration`                                             |
| Publishing   | `CreateDeployment`, `CreateStage`, `GetStage`, `GetStages`, `DeleteStage`      |

CloudFormation deploys `AWS::ApiGateway::RestApi`, `Resource`, `Method`, `Authorizer`, `Deployment`
and `Stage`, including the template CDK synthesizes from a `RestApi` or a `LambdaRestApi`. See
[Deploying from CloudFormation and CDK](#deploying-from-cloudformation-and-cdk).

## Limitations

- An `AWS::ApiGateway::Deployment` is created and never deleted, because API Gateway deletes one
  and this simulation has no command for it. A Stack teardown lists it in
  `stack.skippedResourceDeletions` and the deployment goes with its API a moment later.
- A repeated request header reaches the handler as one joined value in `multiValueHeaders`, because
  that is the form the platform's `Headers` hands over. Real API Gateway reports each separately.
- A Lambda authorizer's `context` reaches the handler as the authorizer returned it. AWS accepts a
  string, a number or a boolean for each value, and how it renders them is not published.
- A Cognito authorizer reads a `providerARN` for the pool id it names, so a pool in another account
  is verified against whenever this simulation holds it. `identityValidationExpression`, which real
  API Gateway matches a token against before verifying it, is outside this.
- Binary media types negotiated by `Accept`, CORS preflight and gateway responses are outside this.
  A response body is still base64 decoded when the handler says `isBase64Encoded`.
- WebSocket APIs are outside this and outside the v2 service.
- Only OpenAPI 3.0.x is imported. `ImportRestApi` and `PutRestApi` refuse a `swagger: "2.0"`
  document and an `openapi: "3.1.0"` one by version. A `Body` carrying a Swagger 2.0 document is
  recorded and the API deploys without it. The body is JSON, and YAML is refused with the same
  message.
- A security scheme carrying `x-amazon-apigateway-authorizer` is not read, and an operation with a
  `security` requirement is refused. An imported method is open or the import did not happen. A
  method gated by an authorizer is declared through `CreateAuthorizer` and `PutMethod` instead. See
  [Authorizing a method](#authorizing-a-method).
- `PutRestApi` replaces a definition and never merges one. `BodyS3Location` on the Resource, and a
  document held anywhere but inline, are outside this.
