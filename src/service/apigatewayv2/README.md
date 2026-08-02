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

## Matching a request

`api/sim-http-api-match.ts` is the entry point: the stage first, then the route, then the integration
behind that route.

The stage goes first because a named stage is a path segment the routes know nothing about, so
`/dev/pets/6` served from stage `dev` reaches route selection as the path `/pets/6`.
`api/stage/sim-http-api-stage-selector.ts` takes that segment off, or falls back to the `$default`
stage, which is served at the root and keeps the whole path.

Routes are then matched by `api/route/`:

```text
SimHttpApiRouteKey            $default, or a method and a path
├── SimHttpApiRouteMethod     GET, ANY and friends, and how specific each is
├── SimHttpApiRoutePath       the segments, and matching a request path against them
│   ├── SimHttpApiLiteralSegment    pets
│   ├── SimHttpApiVariableSegment   {petId}
│   └── SimHttpApiGreedySegment     {proxy+}
└── SimHttpApiRouteRank       which of two matching routes wins
```

Three things are worth knowing here:

- Segments are matched one at a time rather than compiled to a regex. Selection has to compare two
  routes at the segment where they first differ, and a character count gives the wrong answer:
  `GET /a/{b}/ccccc` has more literal characters than `GET /a/b/{c}` and is less specific where it
  matters. `SimCloudFrontPathPattern` counts characters for the same reason CloudFront can, which is
  that it has no segments and no captures.
- Each kind of segment is its own small class answering the same questions, so matching is a loop
  rather than a switch. This is also what keeps the code inside the repo's complexity and file-size
  limits, and what absorbs `noUncheckedIndexedAccess` on the segment arrays.
- The whole precedence rule is in `SimHttpApiRouteRank.compareTo`, in one place, with the parts AWS
  documents and the parts that are only observed marked separately.

A route is stored under its route key signature, which is the key with parameter names erased. That
is the identity real API Gateway gives a route: `GET /pets/{id}` and `GET /pets/{petId}` are one
route, and creating the second is a conflict.

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
   Region its own ARN names, which need not be the API's, and the router hands back that Account's
   IAM alongside the function.
2. `serve/auth/sim-http-api-integration-authorizer.ts` asks whether the API may invoke the function
   at all. The caller is the service principal `apigateway.amazonaws.com`, the action is
   `lambda:InvokeFunction`, and the request supplies `AWS:SourceArn` from
   `api/sim-http-api-execute-api-arn.ts`. A function with no matching permission answers 500 and is
   never invoked, as it is on real AWS. That ARN builder carries the reasoning for what the method
   and path segments of the ARN hold, since neither is documented by AWS.
3. `sim-http-api-endpoint.ts` describes the API, the matched route and the stage as a
   `SimPayload2Endpoint`, including what the route captured from the path.
4. `src/serve/payload-2/` builds the payload format 2.0 event and turns the handler's result back
   into an HTTP response. That machinery is shared with Lambda Function URLs, which speak the same
   format.
5. `sim-api-gateway-v2-error-response.ts` answers the cases where there is nothing to proxy to. The
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
- a malformed route key, refused at `CreateRoute`, which is where real API Gateway refuses it
- an authorization type other than `NONE`
- a stage name that is neither `$default` nor something a URL path segment could hold, and a stage
  without `AutoDeploy: true`, since Deployments are not simulated and such a stage serves nothing on
  real AWS
- `MaxResults`/`NextToken`, since every list command answers in full

See [docs/services/apigatewayv2/README.md](../../../docs/services/apigatewayv2/README.md) for the
user-facing limitations.
