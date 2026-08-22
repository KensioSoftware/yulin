# Simulated Personalize implementation

This directory contains the simulated Personalize service implementation.

Personalize is a machine learning service, and none of the machine learning is here. What is here is
the resource graph a recommendation is served from. That graph is the part application code and
CloudFormation templates actually touch.

## Resources without models

A dataset group holds schemas and datasets. A solution names a recipe on that group. A solution
version stands for the trained model, and a campaign is the endpoint a runtime call names. A
recommender is the domain path's answer to those three at once. An event tracker is where
interactions arrive. All eight exist here as state, reach `ACTIVE` on creation, and report back what
the request gave them.

A solution's recipe ARN is recorded and never looked up. There is no catalogue of custom recipes,
because no model is fitted and one recipe would behave like another. A recommender's recipe ARN is
different. It names one of the ten domain use cases, and the use case decides which parameters a
recommendation request has to carry.

## Entry points

- `sim-personalize.ts` is the main in-memory service object for one account/region scope. It holds
  the runtime API, the rules declared against campaigns, and the accessors a test reads state back
  through.
- `sim-personalize-control-plane.ts` and `sim-personalize-data-operations.ts` are the abstract
  bases it extends, carrying the twenty-seven control plane operations between them. The data
  operations file holds dataset groups, schemas, datasets and event trackers along with the
  constructor, and the control plane file extends it with solutions, solution versions and
  campaigns. The split keeps `sim-personalize.ts` from being that list and nothing else, and it
  keeps both files under the line limit. The control plane and the runtime are split the way AWS
  splits the `personalize` endpoint from `personalize-runtime`.
- `sim-personalize-runtime.ts` is the runtime API, reached through `simAws.personalizeRuntime()` or
  through `runtime()` on the service. It is a second API over one service's state, in the way
  simulated DynamoDB Streams is over simulated DynamoDB. The Account/Region scope builds no service
  for it, and reaches it through the Personalize it already holds.
- `sim-personalize-events.ts` is the events API, reached through `simAws.personalizeEvents()` or
  through `events()` on the service. A third API over one service's state, alongside the runtime.
  What it is sent is recorded rather than trained on, and read back through the accessors on
  `sim-personalize.ts`.
- `cfn/` builds the `AWS::Personalize::*` CloudFormation Resources a stack deploys.
- `index.ts` exports the public Personalize simulator API for `@kensio/yulin/personalize`.

## Resource model

Resource state lives under `resource/`. Every resource carries an ARN, a name, a status and a pair
of timestamps, gathered as `SimPersonalizeResource`. One generic `SimPersonalizeResourceStore`
serves all eight types on the strength of that shared shape, keyed by ARN with a secondary lookup
by name.

`SimPersonalizeResources` gathers the eight stores. The stores sit together, away from the service
facade, because most commands read more than one of them. Creating a dataset reaches its dataset
group and its schema, and creating a campaign reaches a solution version and through it a solution.

Two ARN shapes are worth knowing.

A dataset ARN carries its dataset group and its type in place of the name the request gave. One
group therefore holds one dataset of each type, and two groups can each hold an `INTERACTIONS`
dataset.

A solution version ARN is the solution's with a version on the end. That is why
`simPersonalizeSolutionVersionArn` takes a solution ARN where the other builders take a name and a
scope.

An event tracker is the one resource a request reaches by something other than its ARN. `PutEvents` names the tracking ID, so the events handlers look a tracker up by that and
authorize against the ARN they find. One dataset group takes one tracker, as on real Personalize.

## Commands

Command handlers live under `command/`, grouped by the resource they are about.
`SimPersonalizeCommands` builds all eight groups over one set of resources and one authorizer. The
service facade stays a list of operations because of it.

Every group follows the same order. Read the ARN from the input, authorize against it, resolve the
resource, then act. Authorizing before resolving is deliberate. A caller with no permission learns
only that it has no permission, and the existence of the resource stays hidden.

`command/list/sim-personalize-page.ts` is shared by all eight list operations. The pagination token
is
the index the next page starts at, where real Personalize hands out an opaque string.

## Domain recommenders

`resource/sim-personalize-use-case.ts` holds the ten use cases, five per domain, each with the
recipe ARN it is named by and the parameters `GetRecommendations` has to carry for it.
`sim-personalize-use-case-recipe.ts` beside it resolves a recipe ARN to one of them. The
requirements are the ones AWS documents. Most of them need a `userId` because real Personalize
filters out what the user already has, and that filtering is keyed on the user. `More like X` and
`Frequently bought together` take one only for a `CurrentUser` filter. This simulation has no
filters, and both are answered from their item alone.

Requiring those parameters is the whole of what the use case does. Everything else about a
recommender is state. `CreateRecommender` refuses a custom dataset group, a recipe from the other
domain and a custom recipe, and each of those is a mistake worth catching before it reaches AWS.

A recommender carries a mutable status, which no other resource here does. `StopRecommender` leaves
it `INACTIVE` and `StartRecommender` brings it back, and a runtime request against a stopped one is
refused as invalid input. Reporting it as missing would send a reader looking for a resource that is
still there.

`command/runtime/sim-personalize-recommendation-target.ts` is where a request is matched against its
use case. It also drops the parameters outside the use case, so a `Top picks for you` request carrying an item
is answered from its user. Passing the item through would match an item rule real
Personalize would never have reached.

## Declared results

The runtime API answers from rules held per campaign or recommender under `recommendation/`. Those
are the resources real Personalize answers a runtime call from. A campaign serves one solution
version trained on one recipe and a recommender serves one use case, and two of them answer the same
item differently.

`SimPersonalizeResultRules` keys the rules by ARN and holds the resource each set was declared
against. A resource deleted and created again under the same name therefore starts with an empty
rule set. Rankings are campaigns only. `GetPersonalizedRanking` has no recommender form, and a recommender ARN
handed to `rankings()` is told so where it was written.

`SimDeclaredResultRules` in `util/rule/` does the matching, and simulated Rekognition matches images
with it too. It holds a leading key, a trailing key and a default, matched exactly and in that
order. Personalize puts the item id in the leading tier and the user id in the trailing one. That
order follows the recipes. `aws-similar-items` requires an `itemId` and looks at no user, and the
user personalization recipes require a `userId`.

Rankings carry a user rule and a default, and no item rule. A ranking request names a user and the
list to rank, and an item rule would be one nothing could match. A ranking no rule matches is
answered from the request's own `inputList`. The default there starts as `undefined` to leave room
for that case.

The resource is required to exist before anything is declared against it. An ARN holding no campaign
and no recommender raises `SimPersonalizeDeclarationError`, which follows simulated
Rekognition's `SimRekognitionDeclarationError`. The ARN would otherwise be a typo nothing reported.

## Recorded events

`event/` holds what the events API has been sent. `SimPersonalizeEventRecords` gathers three lists,
one per operation, and the handlers under `command/events/` append to it. `SimPersonalize` reads
them back through `recordedEvents()`, `recordedItems()` and `recordedUsers()`, following
`sesV2().sentEmails()`.

The record is the whole of the observable behaviour. Real Personalize writes the interaction into
the Interactions dataset behind the tracker, and a training run reads it weeks later. Nothing here
trains, and a declared campaign result stays what it was declared as.

Properties arrive as either a JSON string or the object the caller passed the SDK, because
interception reads the Command before the client serialises it. `readSimPersonalizeProperties`
turns both into the string the wire would have carried.

## Deletion rules

Real Personalize refuses to delete a resource other resources still depend on, and these do the
same. A dataset group holding datasets, solutions, recommenders or an event tracker, a schema a
dataset still uses, and a solution a campaign still deploys are all reported as
`ResourceInUseException`.

Deleting a solution takes its versions with it. Real Personalize has no `DeleteSolutionVersion`
either.

## CloudFormation Resources

`cfn/` holds the CloudFormation Resource factory, reached through `cfnResourceFactory()` and
registered under `Personalize` in `sim-cfn-service-factories.ts`. Five `AWS::Personalize::*` types
deploy through it. The dataset group, the schema, the dataset, the solution and the event tracker.
The other five CloudFormation has are batch inference, batch segments, data deletion, metric
attribution and recipes, all of which work over data nothing here reads. A template declaring one is
refused as unsupported, and sim CloudFormation records that as a skip and steps over it.

Every creator goes through the ordinary command on `SimPersonalize`, in the way
`SimCfnSesIdentityCreator` deploys an identity through `CreateEmailIdentity`. A template and an SDK
caller are then validated in one place. What the creators read the stores for is the ARN the command
answered with, turned back into the resource the Resource holds.

`SimCfnPersonalizeProperties` reads the template properties for all five types. Every Personalize
Resource property is a string or a boolean handed straight to a create command. The five types
differ in which names they read and not in how any of them is read. A property with no behaviour
behind it is recorded through `ignoreProperty` with the reason. That covers `Tags`,
`DatasetImportJob` and `SolutionConfig`.

The `Ref` and `Fn::GetAtt` values live with the other services' adapters, under
`cloudformation/resource/cfn/personalize/`. `Ref` is the resource name and `Fn::GetAtt` the ARN. That
is the way round real Personalize publishes them. One adapter class covers all five types on the
strength of that shared shape, carrying the attribute names it answers.

CloudFormation has no `AWS::Personalize::Campaign` or `AWS::Personalize::Recommender` type. A stack
reaches a solution and stops there. Nothing in `cfn/` deploys the far end of the chain, and a test
that wants recommendations builds the solution version and the campaign itself.

## SDK routing

`sdk/route/` splits the thirty-four control plane routes in two, along the same seam the service
facade splits its operations. One file over all of them is past the line limit, and the data and
model halves are the division already there.
