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
└── SimRestApiIntegrationInvocation   the invoke permission, the event, the response
```

The event and response shapes live in `src/serve/payload-1/`, beside the payload format 2.0 ones an
HTTP API and a Lambda Function URL use. The two formats share their body encoding, their proxy
headers and their time format, which are in `src/serve/proxy/`, and differ in everything else.

Both API kinds are issued endpoints under one hostname shape, and a REST API id looks exactly like
an HTTP API id. `src/serve/execute-api/` is what tells them apart, by asking which service allocated
the id. That split is made when the request is routed rather than while the hostname is resolved,
for the same reason a load balancer's DNS name resolves before anything asks whether a load balancer
still answers on it.

## Deploying from a template

`cfn/` turns the `AWS::ApiGateway::*` Resource types into the same commands an SDK caller sends:

```text
SimApiGatewayCfnResourceFactory              which creator answers a Resource type
├── sim-cfn-api-gateway-property-parser.ts   the allow-list of properties
├── sim-cfn-api-gateway-scalar-values.ts     the value shapes each may take
├── sim-cfn-rest-api-template.factory.ts     the template tests deploy
├── sim-cfn-rest-api-template-ids.ts         the logical IDs a test names it by
├── sim-cfn-rest-api-part-deleter.ts         what a teardown deletes an API's parts by
├── api/         RestApi
├── resource/    Resource
├── method/      Method, and the Integration block it carries
├── deployment/  Deployment
└── stage/       Stage
```

Every creator goes through the ordinary command. A template is held to the same rules an SDK caller
is, and the refusals below apply to a deployed Resource as well. Each properties reader states the
properties its type simulates and records every other one against the Resource. That record is what
keeps a template from deploying an API that looks configured to the template and unconfigured to
every request.

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
command. Authorizers, API keys, usage plans, request validators, models, mapping templates and every
integration type other than `AWS_PROXY` are all refused there, so a request naming one fails here
and would have been applied on real AWS.
