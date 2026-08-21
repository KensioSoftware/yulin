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

## Domain dataset groups

A dataset group created with a domain of `ECOMMERCE` or `VIDEO_ON_DEMAND` is a Domain dataset group.
Simulated Personalize records the domain and otherwise treats it like any other group. The
recommenders that make a domain group worth having arrive with the domain path. For now the domain
is state a test can assert on.

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

## Reading state back

`findDatasetGroup`, `findSolution` and `findCampaign` read resources by name without going through a
Command or its authorization.

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

Deletion follows real Personalize. A dataset group holding datasets or solutions is reported as
`ResourceInUseException`, and so is a solution a campaign still deploys. Tear a chain down from the
campaign end.

Deleting a solution takes its versions with it. Real Personalize has no `DeleteSolutionVersion`
either.

## Supported commands

Dataset groups, schemas, datasets, solutions and campaigns each have `Create`, `Describe`, `List`
and `Delete`. Solution versions have `Create`, `Describe` and `List`.

Every command works through `simAws.personalize()` and through an intercepted `PersonalizeClient`.
Each one authorizes through simulated IAM, against the resource ARN where the request names one and
against `*` on a create.

The runtime API has `GetRecommendations` and `GetPersonalizedRanking`. Both work through
`simAws.personalizeRuntime()` and through an intercepted `PersonalizeRuntimeClient`, and both
authorize against the campaign ARN the request names.

## Divergences and limitations

- **Training is skipped.** `CreateSolutionVersion` gives an `ACTIVE` version immediately. Real
  Personalize spends tens of minutes fitting a model and reports `CREATE PENDING` first.
- **A recommendation is declared, never computed.** A campaign answers with the items a rule gives
  it. A score comes from the declaration as well, and an item declared without one comes back
  without one.
- **An unknown item gets the default.** Real Personalize answers an `itemId` it does not recognise
  with popular items, worked out from the interaction history. Simulated Personalize holds no
  interactions. It answers with the campaign's declared default, and with an empty `itemList` where
  nothing is declared.
- **No filters.** `CreateFilter` takes an expression over item and interaction metadata that this
  simulation leaves out by design. A runtime request naming a `filterArn` is refused by name.
- **No `GetActionRecommendations`.** Actions are a dataset type with interactions of their own, and
  the Next-Best-Action operations arrive with them.
- **No events.** `PutEvents`, `PutItems`, `PutUsers` and event trackers arrive with the events API.
- **No recommenders.** `CreateRecommender` and the ten domain use cases arrive with the domain
  path.
- **No CloudFormation.** `AWS::Personalize::*` resource types arrive with their own issue. Real
  CloudFormation has no `AWS::Personalize::Campaign` type at all. A campaign is always created
  outside a template.
- **No data import or metrics.** `CreateDatasetImportJob`, `GetSolutionMetrics` and the batch job
  operations describe work on data that simulated Personalize never reads.
- **A solution version id is a count**, where real Personalize generates an opaque string.
- **Recipes are recorded, never looked up.** There is no recipe catalogue, and `ListRecipes` and
  `DescribeRecipe` are absent.
