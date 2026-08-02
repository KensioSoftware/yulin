# Simulated API Gateway v2 implementation

This directory contains the simulated API Gateway v2 service implementation.

Only HTTP APIs are simulated, which is the half of the v2 API that is not WebSocket. The service
exists so a Node.js handler that runs behind an HTTP API can be tested against a real HTTP request,
rather than only against a hand-built event passed to `InvokeCommand`.

## Entry points

- `sim-api-gateway-v2.ts` is the main in-memory service object for one account/region scope.
- `index.ts` exports the public API for `@kensio/yulin/apigatewayv2`.

The facade is available from account/region containers, for example `simAws.apiGatewayV2()`,
`simAws.account("...").region("...").apiGatewayV2()`.

## The API is the aggregate root

`api/sim-http-api.ts` holds the stored simulated resource, and owns the stores for everything under
it:

```text
SimHttpApi
├── SimHttpApiIntegrationStore   integrations, keyed by allocated id
├── SimHttpApiRouteStore         routes, keyed by route key
└── SimHttpApiStageStore         stages, keyed by stage name
```

Routes, integrations and stages are all addressed by `ApiId` on real AWS and none of them outlives
the API, so they live on the API rather than in service-level maps that would have to carry the
`ApiId` alongside them. Deleting an API therefore deletes everything under it by construction.

`registry/sim-http-api-registry.ts` is the one thing outside that tree. A served request carries the
API id and the region in its hostname, but not the Account, so the registry maps an id to the
Account that owns it. Ids are allocated there, which is what makes them unique across every Account
and Region of one simulated AWS.

## Command handling

`command/` holds one directory per resource area, each with the structural command types
(`*.command.ts`) and the handler class for that area. `command/sim-http-api-access.ts` is the shared
step every command naming an API goes through: authorize first, then look the API up, so a caller
with no permission is told so rather than told the API does not exist.

`command/sim-api-gateway-v2-unsimulated-input.ts` refuses the inputs this simulation does not model.
It works from an allow-list of the options each command accepts, so an option nobody thought about
is refused rather than silently dropped.

### IAM

API Gateway is unusual in what it asks IAM. The action is the HTTP method of the underlying REST
call, `apigateway:POST` and friends, not a name matching the SDK operation, and the resource is the
request path rather than an ARN naming a resource type. So `CreateRoute` on API `a1b2c3d4e5` asks
whether the caller may `apigateway:POST` on `arn:aws:apigateway:<region>::/apis/a1b2c3d4e5/routes`.
Those ARNs carry no Account id, which is not an omission: API Gateway control-plane ARNs leave the
Account segment empty. `command/authorize/sim-api-gateway-v2-authorizer.ts` is where that mapping
lives.

## Serving

`serve/` turns a localhost HTTP request into a Lambda invocation:

1. `sim-api-gateway-v2-router.ts` finds the API from the request hostname, through the registry, and
   the integrated function from the integration's ARN. The function is looked up in the Account and
   Region its own ARN names, which need not be the API's.
2. `sim-http-api-endpoint.ts` describes the API and the matched route as a
   `SimPayload2Endpoint`.
3. `src/serve/payload-2/` builds the payload format 2.0 event and turns the handler's result back
   into an HTTP response. That machinery is shared with Lambda Function URLs, which speak the same
   format.
4. `sim-api-gateway-v2-error-response.ts` answers the cases where there is nothing to proxy to. The
   field is lower-case `message`, which is what an HTTP API uses; a Function URL uses `Message` for
   the same thing.

## What is deliberately refused

Each of these is refused by name rather than accepted and ignored, because an API that looked
configured to the request that configured it and unconfigured to everything else is the failure this
simulation exists to avoid:

- a `WEBSOCKET` protocol type, and the `RouteKey`/`Target` quick-create shorthand
- `CorsConfiguration` and `Tags`
- payload format `1.0`, which builds a different event
- an integration type other than `AWS_PROXY`, and an integration URI that is not an unqualified
  Lambda function ARN
- a route key other than `$default`, and an authorization type other than `NONE`
- a stage name other than `$default`, and a stage without `AutoDeploy: true`, since Deployments are
  not simulated and such a stage serves nothing on real AWS
- `MaxResults`/`NextToken`, since every list command answers in full

The function's resource policy is not evaluated when the integration invokes it. See
[docs/services/apigatewayv2/README.md](../../../docs/services/apigatewayv2/README.md) for the
user-facing limitations.
