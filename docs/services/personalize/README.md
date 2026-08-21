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

## Divergences and limitations

- **Training is skipped.** `CreateSolutionVersion` gives an `ACTIVE` version immediately. Real
  Personalize spends tens of minutes fitting a model and reports `CREATE PENDING` first.
- **Recommendations come later.** `GetRecommendations` and `GetPersonalizedRanking` belong to the
  Personalize Runtime API, which has its own issue.
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
