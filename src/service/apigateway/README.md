# Simulated API Gateway REST API implementation

This directory contains the simulated API Gateway v1 service implementation, which is REST APIs.
HTTP APIs are the v2 service, on a separate SDK client, and they live in `../apigatewayv2/`.

The two are separate services holding separate state. They share the `execute-api` hostname both are
issued endpoints under, and that is the whole of the overlap.

## Entry points

- `sim-api-gateway.ts` is the main in-memory service object for one account/region scope.
- `sim-api-gateway-commands.ts` holds the command areas and the state they share. That leaves the
  facade as state plus delegation.
- `index.ts` exports the public API for `@kensio/yulin/apigateway`.

The facade is available from account/region containers, for example `simAws.apiGateway()`,
`simAws.account("...").region("...").apiGateway()`.

## The API is the aggregate root

`api/sim-rest-api.ts` holds the stored simulated resource, and owns the stores for everything under
it:

```text
SimRestApi
├── SimRestApiResourceStore     the path tree, keyed by allocated resource id
│   └── SimRestApiResource      each node owns its methods, keyed by HTTP method
│       └── SimRestApiMethod    each method owns its integration
├── SimRestApiAuthorizerStore   authorizers, keyed by allocated id
├── SimRestApiDeploymentStore   deployments, keyed by allocated id
└── SimRestApiStageStore        stages, keyed by stage name
```

Real AWS addresses resources, deployments and stages by `restApiId`, and each of them is deleted
with the API. They therefore live on the API. A service-level map would have to carry the id
alongside every entry, and deleting an API would have to walk each map to clear it.

Two of those nestings differ from the v2 service, and both follow what the REST API itself does:

- **A method belongs to a resource.** `PutMethod` addresses a resource id and an HTTP method, and
  a method has no id of its own. An HTTP API route is a resource with a route key.
- **An integration belongs to a method.** `PutIntegration` addresses the same resource and HTTP
  method, and `GetMethod` hands the integration back under `methodIntegration`. An HTTP API
  integration has an id, and several routes can target one.

## The path tree

`api/resource/` holds the tree, flat and keyed by id, with each resource naming its parent:

```text
SimRestApiResourceStore       the nodes, and the rules about adding and removing one
├── SimRestApiResource        one node: a parent, a path part, and the methods on it
└── SimRestApiPathPart        one segment: a literal, {name}, or greedy {name+}
```

The store is flat because that is how the REST API addresses a node. `GetResource` takes a resource
id and nothing else, and `CreateResource` names its parent by id. Each resource also carries the
full path its place in the tree gives it, which `CreateResource` computes and hands back.

A greedy `{proxy+}` part matches the rest of the request path. A resource carrying one therefore
takes no children.

`api/match/` walks a request path against this tree. At each segment the children are tried in the
order real API Gateway resolves them, an exact literal first, then a single-segment `{name}`, then a
greedy `{name+}`. That order is what makes `/orders/new` reach a literal `new` resource where an
`{orderId}` sibling would otherwise have caught it.

## Stages and deployments

A REST API is reachable once a stage exists, and every stage is a path segment of the endpoint. An
HTTP API can serve a `$default` stage at the root, and a REST API always carries the segment.

`SimRestApi.invokeUrl` builds the URL a request to one stage goes to. It is a simulator accessor,
because real API Gateway reports no endpoint for a REST API and leaves callers to build the URL
themselves.

A deployment records that one was made and when. Real API Gateway freezes the resources and methods
into it, and an edit made afterwards reaches no client until another deployment is created. Here a
stage serves the API's current resources. A test that edits a method sees the change straight away,
with no redeployment between the edit and the assertion about it. That is the one place this
departs from AWS.

## Serving a request

`serve/` answers a request to the generated endpoint:

```text
SimApiGatewayServiceController   the entry point, and what a miss is answered with
├── SimApiGatewayRouter          an API id to its scope, an integration URI to its function
├── SimRestApiMethodAuthorizer   what the client may have, in serve/auth/
└── SimRestApiIntegrationInvocation   the invoke permission, the event, the response
```

The client's own authorization runs first. A request presenting no credentials is refused whether or
not the integration behind the method would have worked. Whether the API may invoke a function is a
separate question, asked afterwards, and it is the API's rather than the client's.

`serve/auth/` holds the authorization types, and the pieces under each are the ones that type needs:

```text
SimRestApiMethodAuthorizer                which type the method asks for
├── SimRestApiIamMethodAuthorizer         AWS_IAM: the caller, put to IAM against the method ARN
├── SimRestApiAuthorizerInvocation        CUSTOM: the invoke permission, the event, the answer
│   ├── SimRestApiAuthorizerResponse      the principal, the context, the policy
│   └── SimRestApiAuthorizerPolicy        that policy, put to IAM against the method ARN
└── SimRestApiCognitoMethodAuthorizer     COGNITO_USER_POOLS: the authorizer and the token
    └── SimRestApiCognitoVerification     the key, the signature, the claims, the scopes
```

An `AWS_IAM` method asks the IAM of the Account that owns the API about the caller the serving
boundary resolved. The caller travels on with the admission, and `src/serve/payload-1/` describes it
to the handler under `requestContext.identity`.

A `CUSTOM` method goes to `SimRestApiAuthorizerInvocation`, and the two kinds of Lambda authorizer
part company at the event and nowhere else. A `TOKEN` authorizer is handed the one value the request
carried at its identity source, and a `REQUEST` authorizer is handed a copy of the request as a
payload format 1.0 event. Everything downstream of the answer is shared.

`api/authorizer/identity/` reads the identity source expressions. A REST API writes them as one
comma-separated string where an HTTP API takes a list, so the splitting lives here and the
per-expression parsing mirrors `apigatewayv2/api/authorizer/identity/`.

A `COGNITO_USER_POOLS` method invokes nothing and asks nothing. It verifies the token against the
keys the pools its authorizer names publish, which it reaches through the `SimRestApiUserPools` port
on the API. `SimCognitoRestApiUserPools` is the implementation reading simulated Cognito, and a
standalone `SimApiGateway` gets `SimRestApiNoUserPools` so a gated method stays closed rather than
admitting a token it could not check. The same split is in `../apigatewayv2/` for a JWT authorizer's
issuer keys, and the JWT mechanics both use are in `src/util/jwt/`.

`SimRestApiAuthorizer` is the base the three kinds share, holding the id, the name and the view.
`SimRestApiLambdaAuthorizer` covers `TOKEN` and `REQUEST`, which differ only in the event, and
`SimRestApiCognitoAuthorizer` names pools where that one names a function.

The method ARN is the one part with no HTTP API equivalent worth copying. A REST API authorizer is
handed the ARN of the request the client made, with the concrete path in it, and the policy it
answers is evaluated against that same ARN. `SimRestApiExecuteApiArn` builds it, and builds the two
other forms beside it. One is the resource template form an integration's invoke permission is
matched against. The other is the `<apiId>/authorizers/<authorizerId>` form the authorizer's own
function is invoked under, which names no stage.

The event and response shapes live in `src/serve/payload-1/`, beside the payload format 2.0 ones an
HTTP API and a Lambda Function URL use. The two formats share their body encoding, their proxy
headers and their time format, which are in `src/serve/proxy/`, and differ in everything else.

Both API kinds are issued endpoints under one hostname shape, and a REST API id looks exactly like
an HTTP API id. `src/serve/execute-api/` is what tells them apart, by asking which service allocated
the id. That split is made when the request is routed rather than while the hostname is resolved,
for the same reason a load balancer's DNS name resolves before anything asks whether a load balancer
still answers on it.

## Importing an OpenAPI document

`openapi/` reads an OpenAPI 3.0 document into the same commands an SDK caller sends:

```text
SimRestApiOpenApiDocument        the root, the version check, and the paths
├── SimRestApiOpenApiPathItem    one path: its segments and its operations
├── SimRestApiOpenApiIntegration one x-amazon-apigateway-integration
├── SimRestApiOpenApiPathTree    a resource per segment, shared between paths
├── SimRestApiOpenApiMethods     PutMethod and PutIntegration for one operation
├── SimRestApiOpenApiImport      the walk over the document
└── SimRestApiOpenApiReplacement the overwrite PutRestApi asks for
```

`ImportRestApi`, `PutRestApi` and a `Body` on an `AWS::ApiGateway::RestApi` all arrive here with the
same document and meet the same refusals. `SimRestApiOpenApiValue` and `SimRestApiOpenApiObject`
narrow whatever JSON held. Every refusal carries the RFC 6901 pointer of the member it is about, and
a reader follows that pointer into their own document.

A refusal from one of the ordinary commands is caught by `SimRestApiOpenApiCommand` and given that
pointer. Path part grammar, integration types and URI parsing are therefore stated once, where an
SDK caller and a template already meet them.

The equivalent for HTTP APIs is `../apigatewayv2/openapi/`. The two services keep separate readers
for the same reason they keep separate commands and separate stores. Three things differ in what a
REST API document may carry. It has the catch-all `x-amazon-apigateway-any-method`, it has no
reusable integration definitions, and its paths become a tree where an HTTP API's become route
keys.

## Deploying from a template

`cfn/` turns the `AWS::ApiGateway::*` Resource types into the same commands an SDK caller sends:

```text
SimApiGatewayCfnResourceFactory              which creator answers a Resource type
├── sim-cfn-api-gateway-property-parser.ts   the allow-list of properties
├── sim-cfn-api-gateway-scalar-values.ts     the value shapes each may take
├── sim-cfn-rest-api-template.factory.ts     the template tests deploy
├── sim-cfn-rest-api-template-ids.ts         the logical IDs a test names it by
├── sim-cfn-rest-api-part-deleter.ts         what a teardown deletes an API's parts by
├── sim-cfn-rest-api-imports.ts              the APIs a Body declared
├── api/         RestApi, and the Body it may be declared as
├── resource/    Resource
├── authorizer/  Authorizer
├── method/      Method, and the Integration block it carries
├── deployment/  Deployment
└── stage/       Stage
```

Every creator goes through the ordinary command. A template is held to the same rules an SDK caller
is, and the refusals below apply to a deployed Resource as well. Each properties reader states the
properties its type simulates and records every other one against the Resource. That record is what
keeps a template from deploying an API that looks configured to the template and unconfigured to
every request.

An API carrying a `Body` goes through `ImportRestApi`, which creates its own resources, methods and
integrations. A sibling Resource adding to that API is a template written two ways at once.
`SimCfnRestApiImports` fails the stack naming both Resources. Deploying whichever was created last
would leave what a request reaches turning on the order the stack happened to take.

A method is one Resource and two commands, because the REST API declares a method and what it does
with a request separately. The template writes both as one entry, with the integration as a block of
the method, and `PutMethod` and `PutIntegration` go together or neither does. An integration real
API Gateway refuses takes the method back out again, because the next deployment of the corrected
template would otherwise be refused for a method that already exists.

A teardown deletes each part through the command that removes it, and the API last. A deployment is
the exception. API Gateway deletes one and nothing here does. The Resource is reported as a deletion
nothing carried out, and the deployment goes with its API a moment later.

`Ref` and `Fn::GetAtt` live beside the CloudFormation engine, in
`src/service/cloudformation/resource/cfn/apigateway/`, where every service keeps its value adapters.
A method has no adapter there. It has no id of its own on real AWS, and the engine's fallback
answers a `Ref` with the logical ID.

## What is refused

`command/sim-api-gateway-unsimulated-input.ts` refuses every input outside the accepted set of each
command. API keys, usage plans, request validators, models, mapping templates and every integration
type other than `AWS_PROXY` are all refused there, so a request naming one fails here and would have
been applied on real AWS.

Authorization is refused the same way, in the two commands that carry it.
`CreateAuthorizer` takes `TOKEN` and `COGNITO_USER_POOLS` and refuses `REQUEST`, and `PutMethod`
takes all four of its types. A method served open where AWS would have gated it lets a test pass on
a request real AWS rejects, so a template asking for a type nothing enforces fails to deploy rather
than deploying around it. A method naming an authorizer of the other kind is refused for the same
reason.

An imported document meets those refusals through the commands, and `openapi/` adds the ones about
members no command sees. A document-level `security`, an operation's `security`, a Swagger 2
document and every `x-amazon-apigateway-*` extension outside the two that are read are refused
where they are written.
