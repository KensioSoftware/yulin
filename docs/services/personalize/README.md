# Simulated Personalize

Simulated Personalize holds the resources a recommendation is served from. No model is trained and
no data is read, in the way simulated ACM issues certificates without producing real TLS
certificates. A dataset group, a solution, a solution version and a campaign all exist, carry what
the request gave them, and reach `ACTIVE` straight away.

Personalize-specific types are imported from the `@kensio/yulin/personalize` subpath.

## Building the chain to a campaign

Every runtime recommendation names a campaign, and a campaign is the far end of a chain. The dataset
group holds the data, the solution picks a recipe, the solution version is the trained model, and
the campaign serves it.

```typescript sim-personalize-campaign-chain
/**
 * Walking the custom chain from a dataset group to a campaign.
 */

import {
  CreateCampaignCommand,
  CreateDatasetGroupCommand,
  CreateSolutionCommand,
  CreateSolutionVersionCommand,
  DescribeCampaignCommand,
} from "@aws-sdk/client-personalize";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const group = await simAws
  .personalize()
  .createDatasetGroup(new CreateDatasetGroupCommand({ name: "catalogue" }));

const solution = await simAws.personalize().createSolution(
  new CreateSolutionCommand({
    name: "related-items",
    datasetGroupArn: group.datasetGroupArn,
    recipeArn: "arn:aws:personalize:::recipe/aws-similar-items",
  }),
);

// Real Personalize trains for tens of minutes here and reports CREATE PENDING
// until it finishes. This one is ACTIVE immediately, with nothing to poll.
const version = await simAws
  .personalize()
  .createSolutionVersion(
    new CreateSolutionVersionCommand({ solutionArn: solution.solutionArn }),
  );

const campaign = await simAws.personalize().createCampaign(
  new CreateCampaignCommand({
    name: "related-items",
    solutionVersionArn: version.solutionVersionArn,
  }),
);

const described = await simAws
  .personalize()
  .describeCampaign(
    new DescribeCampaignCommand({ campaignArn: campaign.campaignArn }),
  );

// ACTIVE 1
console.log(described.campaign?.status, described.campaign?.minProvisionedTPS);
```

A solution version ARN is the solution's with a version number on the end, counted from one. Real
Personalize generates an opaque id there. This one counts so a test can write down the ARN it
expects.

## Recommendations from a campaign

A campaign answers the runtime API from results declared against it. No model is fitted and no
interaction history is held. A test says what one campaign recommends for one item, and the code
under test makes the calls it would make against AWS.

The two runtime operations live on `simAws.personalizeRuntime()`, and an intercepted
`PersonalizeRuntimeClient` reaches the same place. They arrive from a separate SDK package
(`@aws-sdk/client-personalize-runtime`), as they do on AWS.

```typescript sim-personalize-recommendations
/**
 * Answering a related items request from declared recommendations.
 */

import {
  CreateCampaignCommand,
  CreateDatasetGroupCommand,
  CreateSolutionCommand,
  CreateSolutionVersionCommand,
} from "@aws-sdk/client-personalize";
import { GetRecommendationsCommand } from "@aws-sdk/client-personalize-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const group = await simAws
  .personalize()
  .createDatasetGroup(new CreateDatasetGroupCommand({ name: "catalogue" }));
const solution = await simAws.personalize().createSolution(
  new CreateSolutionCommand({
    name: "related-entries",
    datasetGroupArn: group.datasetGroupArn,
    recipeArn: "arn:aws:personalize:::recipe/aws-similar-items",
  }),
);
const version = await simAws
  .personalize()
  .createSolutionVersion(
    new CreateSolutionVersionCommand({ solutionArn: solution.solutionArn }),
  );
const campaign = await simAws.personalize().createCampaign(
  new CreateCampaignCommand({
    name: "related-entries",
    solutionVersionArn: version.solutionVersionArn,
  }),
);

const campaignArn = campaign.campaignArn!;

// What this campaign recommends for one entry.
simAws
  .personalize()
  .recommendations(campaignArn)
  .onItem("entry-1042", { itemIds: ["entry-2071", "entry-3388"] });

const recommended = await simAws.personalizeRuntime().getRecommendations(
  new GetRecommendationsCommand({
    campaignArn,
    itemId: "entry-1042",
    numResults: 2,
  }),
);

// entry-2071 entry-3388
console.log(recommended.itemList?.map((item) => item.itemId).join(" "));
```

Results are declared per campaign, through `recommendations()` and `rankings()`. A campaign serves
one solution version trained on one recipe, and two campaigns in a dataset group answer the same
entry differently.

An item rule is read first where the request carries an item, then a user rule, then the default.
That order follows the recipes. `aws-similar-items` requires an `itemId` and looks at no user, and
the user personalization recipes require a `userId`. Each request reaches the tier its own recipe
would have used. Matching is exact, with no pattern syntax.

`numResults` cuts a declared list to length. A request no rule matches gets the campaign's default,
and an empty `itemList` where no default is declared.

An item is declared as an id on its own, or as an id with a score for a test to assert on. The
number comes from the declaration, and a rule that leaves it out answers with an item carrying no
score.

```typescript sim-personalize-recommendation-scores
/**
 * Declaring the scores a campaign reports with its recommendations.
 */

import type { SimAws } from "@kensio/yulin";

declare const simAws: SimAws;
declare const campaignArn: string;

simAws
  .personalize()
  .recommendations(campaignArn)
  .onItem("entry-1042", {
    itemIds: [
      { itemId: "entry-2071", score: 0.62 },
      { itemId: "entry-3388", score: 0.38 },
    ],
    recommendationId: "RID-related-entries",
  });
```

### Rankings

`GetPersonalizedRanking` carries the items in the request and asks for an order to put them in.
Rules are declared against the user, because that is what a ranking request names.

```typescript sim-personalize-rankings
/**
 * Ranking a list of entries for one user.
 */

import { GetPersonalizedRankingCommand } from "@aws-sdk/client-personalize-runtime";

import type { SimAws } from "@kensio/yulin";

declare const simAws: SimAws;
declare const campaignArn: string;

simAws
  .personalize()
  .rankings(campaignArn)
  .onUser("user-77", { itemIds: ["entry-3", "entry-1", "entry-2"] });

const ranked = await simAws.personalizeRuntime().getPersonalizedRanking(
  new GetPersonalizedRankingCommand({
    campaignArn,
    userId: "user-77",
    inputList: ["entry-1", "entry-2", "entry-3"],
  }),
);

// entry-3 entry-1 entry-2
console.log(ranked.personalizedRanking?.map((item) => item.itemId).join(" "));
```

A ranking no rule matches comes back as the `inputList` in the order it arrived, with scores that
descend and sum to one across the list. A test that cares about the order declares a rule for it,
and every other test gets a stable answer.

A rule says exactly what comes back. Declaring two of the three items a request carries answers with
those two, where real Personalize ranks everything it was given.

### Declaring against a campaign

The campaign has to exist first. `recommendations()` and `rankings()` raise
`SimPersonalizeDeclarationError` for an ARN no campaign is deployed at. A typo is reported where it
was typed. A runtime call naming one raises `ResourceNotFoundException`, as real Personalize
Runtime does.

## Datasets and schemas

A dataset belongs to a dataset group and has one of five types. The dataset ARN carries the group
and the type rather than the name the request gave, which is how real Personalize builds it. One
dataset group therefore holds one dataset of each type, and two dataset groups can each hold an
`INTERACTIONS` dataset without colliding.

```typescript sim-personalize-dataset
/**
 * Adding an interactions dataset to a dataset group.
 */

import {
  CreateDatasetCommand,
  CreateDatasetGroupCommand,
  CreateSchemaCommand,
} from "@aws-sdk/client-personalize";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const group = await simAws
  .personalize()
  .createDatasetGroup(new CreateDatasetGroupCommand({ name: "catalogue" }));

// The Avro document is held as the string it arrived as. Simulated
// Personalize reads no dataset, and the fields it declares go unused.
const schema = await simAws.personalize().createSchema(
  new CreateSchemaCommand({
    name: "interactions",
    schema: JSON.stringify({
      type: "record",
      name: "Interactions",
      fields: [
        { name: "USER_ID", type: "string" },
        { name: "ITEM_ID", type: "string" },
        { name: "TIMESTAMP", type: "long" },
      ],
    }),
  }),
);

const dataset = await simAws.personalize().createDataset(
  new CreateDatasetCommand({
    name: "views",
    datasetGroupArn: group.datasetGroupArn,
    schemaArn: schema.schemaArn,
    datasetType: "Interactions",
  }),
);

// ...:dataset/catalogue/INTERACTIONS
console.log(dataset.datasetArn);
```

The five types are `INTERACTIONS`, `ITEMS`, `USERS`, `ACTIONS` and `ACTION_INTERACTIONS`. A request
names one case insensitively and Personalize upper-cases it. `ACTIONS` and `ACTION_INTERACTIONS`
belong to Next-Best-Action, and real Personalize allows them only in a custom dataset group. A
domain dataset group refuses them here too.

## Recording events

An event tracker is where `PutEvents` sends item interactions. It is created against a dataset
group and reports a tracking ID back, and every `PutEvents` names that ID.

```typescript sim-personalize-event-tracker
/**
 * Recording an item interaction through an event tracker.
 */

import {
  CreateDatasetGroupCommand,
  CreateEventTrackerCommand,
} from "@aws-sdk/client-personalize";
import { PutEventsCommand } from "@aws-sdk/client-personalize-events";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const group = await simAws
  .personalize()
  .createDatasetGroup(new CreateDatasetGroupCommand({ name: "catalogue" }));

const tracker = await simAws.personalize().createEventTracker(
  new CreateEventTrackerCommand({
    name: "catalogue-events",
    datasetGroupArn: group.datasetGroupArn,
  }),
);

await simAws.personalizeEvents().putEvents(
  new PutEventsCommand({
    trackingId: tracker.trackingId,
    userId: "visitor-7",
    sessionId: "session-1",
    eventList: [
      { eventType: "view", itemId: "entry-1042", sentAt: new Date() },
    ],
  }),
);

const [event] = simAws.personalize().recordedEvents();

// view entry-1042 visitor-7
console.log(event?.eventType, event?.itemId, event?.userId);
```

The three events operations live on `simAws.personalizeEvents()`, and an intercepted
`PersonalizeEventsClient` reaches the same place. They arrive from a third SDK package
(`@aws-sdk/client-personalize-events`), as they do on AWS.

`recordedEvents()` reads the interactions back, oldest first. A batch is recorded in the order the
request listed it. Each record carries the `eventType`, `sentAt`, `itemId`, `properties`, `userId`
and `sessionId` the request gave, along with the tracking ID it named and the ARN of the tracker
behind it. `eventValue`, `eventId`, `recommendationId` and `impression` are recorded too.

The `properties` of an event are held as the JSON string the wire would carry. The SDK turns an
object into one on its way out. An object handed to the client is serialised here before it is
recorded, and a test asserting on one field parses it back.

An event that leaves `sentAt` out is stamped from the simulated clock. Moving the clock therefore
decides what a later event records:

```typescript sim-personalize-event-clock
/**
 * Timestamping an event from the simulated clock.
 */

import { PutEventsCommand } from "@aws-sdk/client-personalize-events";

import type { SimAws } from "@kensio/yulin";

declare const simAws: SimAws;
declare const trackingId: string;

simAws.clock().freeze();
await simAws.clock().setTo(new Date("2026-03-04T10:00:00.000Z"));

await simAws.personalizeEvents().putEvents(
  new PutEventsCommand({
    trackingId,
    sessionId: "session-1",
    // The SDK types make sentAt a required property, so it is passed as
    // undefined rather than left off.
    eventList: [{ eventType: "view", itemId: "entry-1042", sentAt: undefined }],
  }),
);

// 2026-03-04T10:00:00.000Z
console.log(simAws.personalize().recordedEvents()[0]?.sentAt.toISOString());
```

A `PutEvents` naming a tracking ID no tracker holds raises `ResourceNotFoundException`, and nothing
is recorded. One request carries up to ten events. Real Personalize applies the same limit.

### Items and users

`PutItems` and `PutUsers` are how a catalogue update reaches Personalize between import jobs. Each
one names the dataset it adds to, an Items dataset or a Users dataset.

```typescript sim-personalize-put-items
/**
 * Adding an item and a user through the events API.
 */

import {
  PutItemsCommand,
  PutUsersCommand,
} from "@aws-sdk/client-personalize-events";

import type { SimAws } from "@kensio/yulin";

declare const simAws: SimAws;
declare const itemsDatasetArn: string;
declare const usersDatasetArn: string;

await simAws.personalizeEvents().putItems(
  new PutItemsCommand({
    datasetArn: itemsDatasetArn,
    items: [
      { itemId: "entry-1042", properties: { category: "Horror|Action" } },
    ],
  }),
);

await simAws.personalizeEvents().putUsers(
  new PutUsersCommand({
    datasetArn: usersDatasetArn,
    users: [{ userId: "visitor-7", properties: { membership: "Frequent" } }],
  }),
);

// entry-1042 visitor-7
console.log(
  simAws.personalize().recordedItems()[0]?.itemId,
  simAws.personalize().recordedUsers()[0]?.userId,
);
```

`recordedItems()` and `recordedUsers()` read them back the way `recordedEvents()` does. The
datasets themselves stay empty, as every simulated dataset does.

A dataset ARN of the wrong type is refused as invalid input. Sending items to the Interactions
dataset of the same group is the mistake this catches. Both operations take up to ten records in
one request.

## Domain dataset groups

A dataset group created with a domain of `ECOMMERCE` or `VIDEO_ON_DEMAND` is a Domain dataset group.
It serves recommendations through a recommender rather than through a solution and a campaign, and
an application on that path never creates either.

```typescript sim-personalize-domain-dataset-group
/**
 * Creating a Domain dataset group.
 */

import { CreateDatasetGroupCommand } from "@aws-sdk/client-personalize";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const group = await simAws.personalize().createDatasetGroup(
  new CreateDatasetGroupCommand({
    name: "storefront",
    domain: "ECOMMERCE",
  }),
);

// ECOMMERCE
console.log(group.domain);
```

## Recommenders and their use cases

A recommender goes straight onto a Domain dataset group, for one of the ten use cases AWS trained.
There is no solution and no solution version in between. `GetRecommendations` then names a
`recommenderArn` where the custom path names a `campaignArn`, and results are declared against it
through the same `recommendations()` rules.

```typescript sim-personalize-recommender
/**
 * Serving recommendations from a Domain dataset group recommender.
 */

import {
  CreateDatasetGroupCommand,
  CreateRecommenderCommand,
} from "@aws-sdk/client-personalize";
import { GetRecommendationsCommand } from "@aws-sdk/client-personalize-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const group = await simAws.personalize().createDatasetGroup(
  new CreateDatasetGroupCommand({
    name: "catalogue",
    domain: "VIDEO_ON_DEMAND",
  }),
);

const recommender = await simAws.personalize().createRecommender(
  new CreateRecommenderCommand({
    name: "more-like-x",
    datasetGroupArn: group.datasetGroupArn,
    recipeArn: "arn:aws:personalize:::recipe/aws-vod-more-like-x",
  }),
);

const recommenderArn = recommender.recommenderArn!;

// More like X is answered from the item the request names.
simAws
  .personalize()
  .recommendations(recommenderArn)
  .onItem("title-88", { itemIds: ["title-12", "title-40"] });

const recommended = await simAws
  .personalizeRuntime()
  .getRecommendations(
    new GetRecommendationsCommand({ recommenderArn, itemId: "title-88" }),
  );

// title-12 title-40
console.log(recommended.itemList?.map((item) => item.itemId).join(" "));
```

A recommender is `ACTIVE` on creation, for the reason `CreateSolutionVersion` gives one immediately.
Real Personalize trains for hours and retrains every seven days.

### The ten use cases

The recipe ARN picks the use case, and the use case decides what a request has to carry. A request
leaving out a parameter its use case requires is refused, which is what real Personalize does with
it. That refusal is the part of the domain path worth simulating, and everything else here is state.

| Use case                           | Recipe ARN suffix                              | Requires           |
| ---------------------------------- | ---------------------------------------------- | ------------------ |
| Most popular                       | `aws-vod-most-popular`                         | `userId`           |
| Trending now                       | `aws-vod-trending-now`                         | `userId`           |
| Top picks for you                  | `aws-vod-top-picks`                            | `userId`           |
| More like X                        | `aws-vod-more-like-x`                          | `itemId`           |
| Because you watched X              | `aws-vod-because-you-watched-x`                | `itemId`, `userId` |
| Most viewed                        | `aws-ecomm-popular-items-by-views`             | `userId`           |
| Best sellers                       | `aws-ecomm-popular-items-by-purchases`         | `userId`           |
| Recommended for you                | `aws-ecomm-recommended-for-you`                | `userId`           |
| Frequently bought together         | `aws-ecomm-frequently-bought-together`         | `itemId`           |
| Customers who viewed X also viewed | `aws-ecomm-customers-who-viewed-x-also-viewed` | `itemId`, `userId` |

Each ARN is that suffix under `arn:aws:personalize:::recipe/`. The first five belong to
`VIDEO_ON_DEMAND` and the last five to `ECOMMERCE`, and a recipe from the other domain is refused on
`CreateRecommender`. So is a custom recipe such as `aws-similar-items`, which belongs to a solution.

Most of the use cases require a `userId` because real Personalize filters out what the user has
already watched or bought, and that filtering is keyed on the user. `More like X` and
`Frequently bought together` take one only to apply a `CurrentUser` filter, and filters are not
simulated here.

A parameter a use case does not read is ignored rather than matched on. A `Top picks for you`
request carrying an `itemId` as well as its `userId` is answered from the user rule, since that is
the tier real Personalize would have used.

### Starting and stopping

`StopRecommender` leaves the recommender in place and stops it serving. `GetRecommendations` against
a stopped one is refused by name until `StartRecommender` brings it back, and everything declared
against it survives the round trip.

```typescript sim-personalize-recommender-stop
/**
 * Stopping and starting a recommender.
 */

import {
  StartRecommenderCommand,
  StopRecommenderCommand,
} from "@aws-sdk/client-personalize";

import type { SimAws } from "@kensio/yulin";

declare const simAws: SimAws;
declare const recommenderArn: string;

await simAws
  .personalize()
  .stopRecommender(new StopRecommenderCommand({ recommenderArn }));

// INACTIVE
console.log(simAws.personalize().findRecommender("more-like-x")?.status);

await simAws
  .personalize()
  .startRecommender(new StartRecommenderCommand({ recommenderArn }));
```

`UpdateRecommender` replaces the configuration whole. `itemExplorationConfig` and
`minRecommendationRequestsPerSecond` are recorded and read back through `DescribeRecommender`, and
nothing here explores or provisions anything.

Deleting a Domain dataset group needs its recommenders deleted first, the way it needs its datasets
and solutions gone. A group still holding one is reported as `ResourceInUseException`.

## Deploying Personalize resources with CloudFormation

`AWS::Personalize::DatasetGroup`, `AWS::Personalize::Schema`, `AWS::Personalize::Dataset`,
`AWS::Personalize::Solution` and `AWS::Personalize::EventTracker` deploy into simulated Personalize.
A project that declares them in CDK or CloudFormation can deploy the same template its application
deploys, with no hand-written test setup.

Each one goes through the ordinary create command. A template and an SDK caller get the same
validation, the same refusals and the same ARN.

```typescript sim-personalize-cloudformation
/**
 * Deploying a Personalize dataset group, schema, dataset and solution.
 */

import {
  CreateCampaignCommand,
  CreateSolutionVersionCommand,
} from "@aws-sdk/client-personalize";
import { GetRecommendationsCommand } from "@aws-sdk/client-personalize-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "catalogue",
  template: {
    Resources: {
      Catalogue: {
        Type: "AWS::Personalize::DatasetGroup",
        Properties: { Name: "catalogue" },
      },
      InteractionsSchema: {
        Type: "AWS::Personalize::Schema",
        Properties: {
          Name: "interactions",
          Schema: JSON.stringify({
            type: "record",
            name: "Interactions",
            fields: [
              { name: "USER_ID", type: "string" },
              { name: "ITEM_ID", type: "string" },
              { name: "TIMESTAMP", type: "long" },
            ],
          }),
        },
      },
      Views: {
        Type: "AWS::Personalize::Dataset",
        Properties: {
          Name: "views",
          DatasetType: "Interactions",
          DatasetGroupArn: { "Fn::GetAtt": ["Catalogue", "DatasetGroupArn"] },
          SchemaArn: { "Fn::GetAtt": ["InteractionsSchema", "SchemaArn"] },
        },
      },
      RelatedItems: {
        Type: "AWS::Personalize::Solution",
        Properties: {
          Name: "related-items",
          DatasetGroupArn: { "Fn::GetAtt": ["Catalogue", "DatasetGroupArn"] },
          RecipeArn: "arn:aws:personalize:::recipe/aws-similar-items",
        },
      },
    },
    Outputs: {
      SolutionArn: { Value: { "Fn::GetAtt": ["RelatedItems", "SolutionArn"] } },
    },
  },
});

// The stack stops at the solution. The version and the campaign are created
// here, the way they are created outside a template on AWS.
const version = await simAws.personalize().createSolutionVersion(
  new CreateSolutionVersionCommand({
    solutionArn: stack.outputs.get("SolutionArn")!.value as string,
  }),
);

const campaign = await simAws.personalize().createCampaign(
  new CreateCampaignCommand({
    name: "related-items",
    solutionVersionArn: version.solutionVersionArn,
  }),
);

const campaignArn = campaign.campaignArn!;

simAws
  .personalize()
  .recommendations(campaignArn)
  .onItem("entry-1042", { itemIds: ["entry-2071"] });

const recommended = await simAws
  .personalizeRuntime()
  .getRecommendations(
    new GetRecommendationsCommand({ campaignArn, itemId: "entry-1042" }),
  );

// entry-2071
console.log(recommended.itemList?.[0]?.itemId);
```

`Ref` answers with the resource name, and `Fn::GetAtt` with the ARN. The attribute is
`DatasetGroupArn`, `SchemaArn`, `DatasetArn`, `SolutionArn` or `EventTrackerArn`, one per type. That
is the way round real Personalize publishes them. Every Personalize API takes an ARN, and a template
wiring one resource into another reads `Fn::GetAtt`. An event tracker publishes `TrackingId` too.
`PutEvents` names that value, and a stack Output is where a test picks it up. An attribute a type
does not publish fails the deploy, since answering one would let a template deploy here and fail on
AWS.

### A stack stops at the solution

CloudFormation has no `AWS::Personalize::Campaign` type and no `AWS::Personalize::Recommender` type.
A campaign is what every runtime call names, and it is always created out of band through the SDK,
the CLI or the console. A deployed stack gets as far as a solution and stops there. A test creates
the solution version and the campaign itself, as the example above does. This is real Personalize
behaviour and worth knowing before reading it as a gap in the simulation.

The domain path stops in the same place. `Domain` is a property of `AWS::Personalize::DatasetGroup`,
and a template can declare a Domain dataset group. No `AWS::Personalize::Recommender` type exists to
put a recommender on it.

### Types a stack steps over

`AWS::Personalize::BatchInferenceJob`, `AWS::Personalize::BatchSegmentJob`,
`AWS::Personalize::DataDeletionJob`, `AWS::Personalize::MetricAttribution` and
`AWS::Personalize::Recipe` all work over data simulated Personalize never reads. A template
declaring one deploys, with that Resource in `stack.skippedResources` under a reason naming the
type, and the rest of the stack around it.

Deleting the stack removes the resources it made, in reverse dependency order. That order is what
Personalize needs, since a dataset group holding a dataset, a solution or an event tracker refuses
to be deleted.

## Reading state back

`findDatasetGroup`, `findSolution`, `findCampaign` and `findRecommender` read resources by name
without going through a Command or its authorization. `recordedEvents()`, `recordedItems()` and `recordedUsers()` read back
what the events API was sent.

```typescript sim-personalize-accessors
/**
 * Reading a created resource back through the simulator's own accessor.
 */

import { CreateDatasetGroupCommand } from "@aws-sdk/client-personalize";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws
  .personalize()
  .createDatasetGroup(new CreateDatasetGroupCommand({ name: "catalogue" }));

const group = simAws.personalize().findDatasetGroup("catalogue");

// catalogue ACTIVE
console.log(group?.name, group?.status);
```

## Deleting resources

Deletion follows real Personalize. A dataset group holding datasets, solutions or an event tracker
is reported as `ResourceInUseException`, and so is a solution a campaign still deploys. Tear a chain
down from the campaign end.

Deleting an event tracker leaves the events it accepted recorded, as real Personalize leaves the
interactions it wrote in the dataset behind it.

Deleting a solution takes its versions with it. Real Personalize has no `DeleteSolutionVersion`
either.

## Supported commands

Dataset groups, schemas, datasets, solutions, campaigns and event trackers each have `Create`,
`Describe`, `List` and `Delete`. Solution versions have `Create`, `Describe` and `List`.
Recommenders have those four plus `Update`, `Start` and `Stop`.

Every command works through `simAws.personalize()` and through an intercepted `PersonalizeClient`.
Each one authorizes through simulated IAM, against the resource ARN where the request names one and
against `*` on a create.

The runtime API has `GetRecommendations` and `GetPersonalizedRanking`. Both work through
`simAws.personalizeRuntime()` and through an intercepted `PersonalizeRuntimeClient`.
`GetPersonalizedRanking` names a campaign, and `GetRecommendations` names a campaign or a
recommender. Each authorizes against the ARN the request carries.

The events API has `PutEvents`, `PutItems` and `PutUsers`. All three work through
`simAws.personalizeEvents()` and through an intercepted `PersonalizeEventsClient`. `PutEvents`
authorizes against the ARN of the tracker its tracking ID belongs to, and the other two against the
dataset ARN they name.

## Divergences and limitations

- **Training is skipped.** `CreateSolutionVersion` gives an `ACTIVE` version immediately. Real
  Personalize spends tens of minutes fitting a model and reports `CREATE PENDING` first.
- **A recommendation is declared, never computed.** A campaign answers with the items a rule gives
  it. A score comes from the declaration as well, and an item declared without one comes back
  without one.
- **A request no rule matches gets the default.** Real Personalize answers an `itemId` it does not
  recognise with popular items, worked out from the interaction history. Simulated Personalize
  holds no interactions. A request carrying an unknown item falls to the user rule where it names a
  user and one is declared, then to the campaign's default, and then to an empty `itemList`.
- **No filters.** `CreateFilter` takes an expression over item and interaction metadata that this
  simulation leaves out by design. A runtime request naming a `filterArn` is refused by name.
- **No `GetActionRecommendations`.** Actions are a dataset type with interactions of their own, and
  the Next-Best-Action operations arrive with them.
- **A recorded event trains nothing.** Real Personalize puts the interaction into the Interactions
  dataset behind the tracker, and a later training run reads it. A campaign here answers with what
  was declared against it however many events it has been sent.
- **A tracking ID is a UUID that changes every run.** Real Personalize generates one too. Read it
  from the `CreateEventTracker` response rather than writing it down.
- **No `metricAttribution` on an event.** It ties an event to a metric attribution report, and
  `CreateMetricAttribution` is absent. An event carrying one is refused by name.
- **No `PutActions` or `PutActionInteractions`.** They belong with Next-Best-Action, alongside
  `GetActionRecommendations`.
- **A recommender is declared, never trained.** It is `ACTIVE` at once, where real Personalize
  trains for hours and retrains every seven days. `Top picks for you` and `Recommended for you`
  also update every two hours on AWS, and nothing here updates.
- **No automatic filtering of what the user already has.** Several use cases drop items the user
  purchased or watched, worked out from their event history. Simulated Personalize holds no such
  history, so a declared list comes back whole.
- **Exploration is recorded, never applied.** `explorationWeight` and the item age cutoff read back
  from `DescribeRecommender` and change no recommendation.
- **Five CloudFormation types are stepped over.** `AWS::Personalize::BatchInferenceJob`,
  `BatchSegmentJob`, `DataDeletionJob`, `MetricAttribution` and `Recipe` all work over data this
  simulation never reads. A template declaring one deploys with the Resource skipped.
- **No data import or metrics.** `CreateDatasetImportJob`, `GetSolutionMetrics` and the batch job
  operations describe work on data that simulated Personalize never reads.
- **A solution version id is a count**, where real Personalize generates an opaque string.
- **Recipes are recorded, never looked up.** There is no recipe catalogue, and `ListRecipes` and
  `DescribeRecipe` are absent.
