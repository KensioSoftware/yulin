# Simulated Personalize implementation

This directory contains the simulated Personalize service implementation.

Personalize is a machine learning service, and none of the machine learning is here. What is here is
the resource graph a recommendation is served from. That graph is the part application code and
CloudFormation templates actually touch.

## Resources without models

A dataset group holds schemas and datasets. A solution names a recipe on that group. A solution
version stands for the trained model, and a campaign is the endpoint a runtime call names. An event
tracker is where interactions arrive. All seven exist here as state, reach `ACTIVE` on creation, and
report back what the request gave them.

The recipe ARN is recorded and never looked up. There is no catalogue of recipes, because no model
is fitted and one recipe would behave like another. That changes with domain recommenders, where the
use case a recipe names decides which parameters a recommendation request has to carry.

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
- `index.ts` exports the public Personalize simulator API for `@kensio/yulin/personalize`.

## Resource model

Resource state lives under `resource/`. Every resource carries an ARN, a name, a status and a pair
of timestamps, gathered as `SimPersonalizeResource`. One generic `SimPersonalizeResourceStore`
serves all seven types on the strength of that shared shape, keyed by ARN with a secondary lookup
by name.

`SimPersonalizeResources` gathers the seven stores. The stores sit together, away from the service
facade, because most commands read more than one of them. Creating a dataset reaches its dataset
group and its schema, and creating a campaign reaches a solution version and through it a solution.

Two ARN shapes are worth knowing.

A dataset ARN carries its dataset group and its type in place of the name the request gave. One
group therefore holds one dataset of each type, and two groups can each hold an `INTERACTIONS`
dataset.

A solution version ARN is the solution's with a version on the end. That is why
`simPersonalizeSolutionVersionArn` takes a solution ARN where the other builders take a name and a
scope.

An event tracker is the seventh resource type and the one a request reaches by something other than
its ARN. `PutEvents` names the tracking ID, so the events handlers look a tracker up by that and
authorize against the ARN they find. One dataset group takes one tracker, as on real Personalize.

## Commands

Command handlers live under `command/`, grouped by the resource they are about.
`SimPersonalizeCommands` builds all seven groups over one set of resources and one authorizer. The
service facade stays a list of operations because of it.

Every group follows the same order. Read the ARN from the input, authorize against it, resolve the
resource, then act. Authorizing before resolving is deliberate. A caller with no permission learns
only that it has no permission, and the existence of the resource stays hidden.

`command/list/sim-personalize-page.ts` is shared by all seven list operations. The pagination token
is
the index the next page starts at, where real Personalize hands out an opaque string.

## Declared results

The runtime API answers from rules held per campaign under `recommendation/`. That is the resource
real Personalize answers a runtime call from. A campaign serves one solution version trained on one
recipe, and two campaigns answer the same item differently.

`SimDeclaredResultRules` in `util/rule/` does the matching, and simulated Rekognition matches images
with it too. It holds a leading key, a trailing key and a default, matched exactly and in that
order. Personalize puts the item id in the leading tier and the user id in the trailing one. That
order follows the recipes. `aws-similar-items` requires an `itemId` and looks at no user, and the
user personalization recipes require a `userId`.

Rankings carry a user rule and a default, and no item rule. A ranking request names a user and the
list to rank, and an item rule would be one nothing could match. A ranking no rule matches is
answered from the request's own `inputList`. The default there starts as `undefined` to leave room
for that case.

A campaign is required to exist before anything is declared against it. An ARN no campaign is
deployed at raises `SimPersonalizeDeclarationError`, which follows simulated Rekognition's
`SimRekognitionDeclarationError`. The ARN would otherwise be a typo nothing reported.

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
same. A dataset group holding datasets, solutions or an event tracker, a schema a dataset still
uses, and a solution a campaign still deploys are all reported as `ResourceInUseException`.

Deleting a solution takes its versions with it. Real Personalize has no `DeleteSolutionVersion`
either.

## What comes next

CloudFormation resource types and domain recommenders are separate issues. Both build on what is
here.
