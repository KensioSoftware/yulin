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
├── SimHttpApiAuthorizerStore    authorizers, keyed by allocated id
├── SimHttpApiIntegrationStore   integrations, keyed by allocated id
├── SimHttpApiRouteStore         routes, keyed by route key
└── SimHttpApiStageStore         stages, keyed by stage name
```

Authorizers, routes, integrations and stages are all addressed by `ApiId` on real AWS and none of
them outlives the API, so they live on the API rather than in service-level maps that would have to
carry the `ApiId` alongside them. Deleting an API therefore deletes everything under it by
construction.

The API also carries the `SimHttpApiJwtIssuerKeys` port its authorizers verify against, for the same
reason: a served request finds the API and nothing else.

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

## Authorizing a request

`api/authorizer/` holds the JWT authorizer and everything the decision needs:

```text
SimHttpApiAuthorizer
├── SimHttpApiIdentitySource     which header or query parameter carries the token
├── SimHttpApiJwtConfiguration   the issuer trusted and the audiences accepted
└── SimHttpApiJwtVerification    the ordered checks, answering an authorization
    ├── SimHttpApiJwtClaimChecks the issuer, the audience, then the time claims
    └── SimHttpApiJwtClaims      the claims as the handler receives them
```

The token parsing and RS256 verification itself is `src/util/jwt/`, which knows nothing about API
Gateway. It is real verification against the issuer's published JWK, with `node:crypto`: nothing is
stubbed, and no verification library is imported.

An authorizer names its issuer by URL and nothing else, because a JWT authorizer accepts any OIDC
issuer. `SimHttpApiJwtIssuerKeys` is the port that turns that URL into keys, and
`SimCognitoHttpApiJwtIssuerKeys` is the adapter over `SimCognitoUserPoolRegistry`, in the same shape
as `SimAcmDnsRecords` and `SimRoute53AcmDnsRecords`. A standalone `SimApiGatewayV2` gets
`SimHttpApiNoJwtIssuerKeys`, where every issuer publishes nothing, so a JWT route stays closed rather
than admitting a token it could not check.

Nothing is fetched over HTTP, deliberately. `SimCognitoOpenIdConfiguration` publishes an `issuer`
naming the localhost origin it is served from, while a token's `iss` names the real AWS URL, so an
OIDC-conformant discovery client would reject its own pool's tokens. Resolving in process compares
`pool.issuerUrl` against the token's `iss`, and both come from the same getter.

`SimHttpApiAuthorization` is what a decision answers with: `SimHttpApiAdmitted`, carrying whatever the
event needs to describe the caller, or `SimHttpApiRefused`, which is a 401 for everything up to and
including claim validation and a 403 for an unmet route scope or an IAM refusal.

The other kind of route authorization is `AWS_IAM`, which has nothing under `api/authorizer/` at all:
it configures nothing on the API, so there is nothing to store. It lives entirely in `serve/auth/`,
because it is decided from the request rather than from anything the API holds.

`registry/sim-http-api-registry.ts` is the one thing outside that tree. A served request carries the
API id and the region in its hostname, but not the Account, so the registry maps an id to the
Account that owns it. Ids are allocated there, which is what makes them unique across every Account
and Region of one simulated AWS.

## Command handling

`command/` holds one directory per resource area, each with the structural command types
(`*.command.ts`) and the handler class for that area. `command/sim-http-api-access.ts` is the shared
step every command naming an API goes through: authorize first, then look the API up, so a caller
with no permission is told so rather than told the API does not exist.

`command/api/sim-http-api-import-commands.ts` is the odd one out: `ImportApi` creates an API and then
everything under it, so it drives the other command classes rather than the stores. It authorizes
once, against the API collection `CreateApi` addresses, because an import is one request and there is
no API id to name anything under yet. A document it refuses part way through leaves no API behind,
which is the error category AWS describes.

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

## Importing an OpenAPI document

`openapi/` turns an OpenAPI 3.0 document into the routes, integrations and authorizers of an API that
already exists. Two entry points reach it, `ImportApi` and an `AWS::ApiGatewayV2::Api` `Body`, and
they differ only in how the document arrives: CloudFormation serialises the inline JSON object it
resolved and calls `importApi`, so there is one translator and one set of refusals.

Nothing here restates a rule a command already states. Route key grammar, payload format, integration
URIs and issuer validation are all met by going through `CreateRoute`, `CreateIntegration` and
`CreateAuthorizer`, and `SimHttpApiOpenApiCommand` gives whatever one of them refuses the pointer of
the member that produced the input. A conflict, such as the one two paths whose parameters differ
only by name produce, is passed on as it is.

```text
SimHttpApiOpenApiDocument         the root, and the version check
├── SimHttpApiOpenApiValue        one value at a pointer, and the shapes it can be
│   └── SimHttpApiOpenApiObject   the members under one object
├── SimHttpApiOpenApiPointer      RFC 6901 pointers, built up as the readers descend
├── SimHttpApiOpenApiPaths        the path map
│   └── SimHttpApiOpenApiPathItem the keys within one path
│       └── SimHttpApiOpenApiOperation  one operation's integration and security
├── SimHttpApiOpenApiIntegrations       the integration behind each operation
│   ├── SimHttpApiOpenApiIntegrationReferences  the one $ref form, created once
│   └── SimHttpApiOpenApiIntegration            the extension object
└── SimHttpApiOpenApiSecuritySchemes    scheme to authorizer, created once
    └── SimHttpApiOpenApiSecurityScheme one scheme
```

The decomposition is not decoration. The refusal surface is most of the work here, and a single
document reader would not survive `max-lines`, `complexity` or `scripts/sh/fta.sh`.

Most of an OpenAPI document is ignored, which is what AWS does with it. `requestBody`, the content
schemas under `responses` and `components.schemas` are valid OpenAPI that HTTP APIs do not support,
so there is no JSON Schema to understand and no `$ref` to resolve across schema trees. The one
reference form that must resolve is the single-level local one into
`components.x-amazon-apigateway-integrations`.

`cfn/sim-cfn-http-api-imports.ts` is the CloudFormation side of the same rule: an `Api` declaring the
API as a document creates its own routes, so a sibling Resource creating another one on that API
fails the stack rather than deploying a template written two ways at once.

## Serving

`serve/` turns a localhost HTTP request into a Lambda invocation:

1. `sim-api-gateway-v2-router.ts` finds the API from the request hostname, through the registry, and
   the integrated function from the integration's ARN. The function is looked up in the Account and
   Region its own ARN names, which need not be the API's, and the router hands back that Account's
   IAM alongside the function.
2. `serve/auth/sim-http-api-route-authorizer.ts` asks whether the client may have the matched route.
   This comes first, before the integration is even looked up: a request presenting no credentials is
   refused whether or not the integration behind the route would have worked. It settles which kind
   of authorization the route asks for and hands the decision to the one that makes it:

   ```text
   SimHttpApiRouteAuthorizer
   ├── NONE     admits everyone, with no caller to describe
   ├── JWT      SimHttpApiJwtRouteAuthorizer, over the API's own authorizers
   └── AWS_IAM  SimHttpApiIamRouteAuthorizer, evaluating execute-api:Invoke
   ```

   The IAM one asks the API's own Account, which the router resolves, and supplies no resource
   policies, because an HTTP API has none. That is also what makes a caller from another Account
   always refused: a cross-Account request needs an Allow from the resource side. The resource is the
   `execute-api` ARN of the request, built by `api/sim-http-api-execute-api-arn.ts` from the concrete
   method and path rather than from the route key.

3. `serve/auth/sim-http-api-integration-authorizer.ts` asks whether the API may invoke the function
   at all. The caller is the service principal `apigateway.amazonaws.com`, the action is
   `lambda:InvokeFunction`, and the request supplies `AWS:SourceArn` from
   `api/sim-http-api-execute-api-arn.ts`. A function with no matching permission answers 500 and is
   never invoked, as it is on real AWS. That ARN builder carries the reasoning for what the method
   and path segments of the ARN hold, since neither is documented by AWS.
4. `sim-http-api-endpoint.ts` describes the API, the matched route and the stage as a
   `SimPayload2Endpoint`, including what the route captured from the path.
5. `src/serve/payload-2/` builds the payload format 2.0 event and turns the handler's result back
   into an HTTP response. That machinery is shared with Lambda Function URLs, which speak the same
   format.
6. `sim-api-gateway-v2-error-response.ts` answers the cases where there is nothing to proxy to. The
   field is lower-case `message`, which is what an HTTP API uses; a Function URL uses `Message` for
   the same thing.

## CloudFormation

`cfn/` creates the five `AWS::ApiGatewayV2::*` Resource types this simulation deploys, one directory
per type, each with a creator and a properties reader:

```text
cfn/
├── sim-cfn-api-gateway-v2-resource-factory.ts   switches on the bare type name
├── sim-cfn-api-gateway-v2-property-parser.ts    the allow-list of properties
├── sim-cfn-api-gateway-v2-property-values.ts    the value shapes each may take
├── sim-cfn-http-api-template.factory.ts         the template tests deploy
├── sim-cfn-http-api-imports.ts                 which APIs a Body declared
├── api/         Api, and the Body an imported one carries
├── authorizer/  Authorizer
├── integration/ Integration, and the two IntegrationUri forms
├── route/       Route
└── stage/       Stage
```

Every creator goes through the ordinary command, so a template is held to the same rules an SDK
caller is, and the refusals above apply to a deployed Resource as well. Each properties reader states
the properties its type simulates and refuses every other one by name, which is what keeps a template
from deploying an API that looks configured to the template and unconfigured to every request.

A `Route` naming an `AuthorizerId` no authorizer of the API has is refused by `CreateRoute`, which is
also what catches a `Ref` to a Resource this simulation skipped: a skipped Resource matches no value
adapter, so the `Ref` resolves to its own logical ID, and no authorizer has that id.

The CloudFormation-facing `Ref` and `Fn::GetAtt` values live in
`src/service/cloudformation/resource/cfn/apigatewayv2/` instead, beside the other services' adapters,
so the simulated API, route, integration and stage objects stay service-focused.

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
- an authorization type other than `NONE`, `JWT` or `AWS_IAM`, and an `AuthorizerId` or
  `AuthorizationScopes` on a route that has no use for either
- a `Policy` on `AWS::ApiGatewayV2::Api`, with a message of its own: AWS has no such property, since
  an HTTP API has no resource policy
- an authorizer type other than `JWT`, and every option only a Lambda `REQUEST` authorizer takes,
  including `AuthorizerResultTtlInSeconds`
- more than one `IdentitySource`, and an identity source naming neither a header nor a query string
  parameter
- a stage name that is neither `$default` nor something a URL path segment could hold, and a stage
  without `AutoDeploy: true`, since Deployments are not simulated and such a stage serves nothing on
  real AWS
- `MaxResults`/`NextToken`, since every list command answers in full
- an OpenAPI document that is not 3.0.x, and every member of one this simulation cannot apply, each
  refused with the JSON pointer of the member rather than dropped
- `FailOnWarnings: false`, since everything an import cannot apply is refused rather than warned
  about, which is what `true` asks for

See [docs/services/apigatewayv2/README.md](../../../docs/services/apigatewayv2/README.md) for the
user-facing limitations.
