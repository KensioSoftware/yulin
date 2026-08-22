import {
  DeleteStackCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { jsonStringify } from "../../../util/type-guard/json.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";

const similarItemsRecipe = "arn:aws:personalize:::recipe/aws-similar-items";

const userPersonalizationRecipe =
  "arn:aws:personalize:::recipe/aws-user-personalization-v2";

const interactionsSchema = jsonStringify({
  type: "record",
  name: "Interactions",
  fields: [
    { name: "USER_ID", type: "string" },
    { name: "ITEM_ID", type: "string" },
    { name: "TIMESTAMP", type: "long" },
  ],
});

/**
 * The whole chain a template can declare, with the recipe left open so an
 * update has something to change.
 */
function catalogueTemplate(recipeArn: string): CfnTemplateBodyRecord {
  return {
    Resources: {
      Catalogue: {
        Type: "AWS::Personalize::DatasetGroup",
        Properties: { Name: "catalogue" },
      },
      InteractionsSchema: {
        Type: "AWS::Personalize::Schema",
        Properties: { Name: "interactions", Schema: interactionsSchema },
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
          RecipeArn: recipeArn,
        },
      },
      CatalogueEvents: {
        Type: "AWS::Personalize::EventTracker",
        Properties: {
          Name: "catalogue-events",
          DatasetGroupArn: { "Fn::GetAtt": ["Catalogue", "DatasetGroupArn"] },
        },
      },
    },
    Outputs: {
      GroupRef: { Value: { Ref: "Catalogue" } },
      GroupArn: { Value: { "Fn::GetAtt": ["Catalogue", "DatasetGroupArn"] } },
      SchemaRef: { Value: { Ref: "InteractionsSchema" } },
      SchemaArn: {
        Value: { "Fn::GetAtt": ["InteractionsSchema", "SchemaArn"] },
      },
      DatasetRef: { Value: { Ref: "Views" } },
      DatasetArn: { Value: { "Fn::GetAtt": ["Views", "DatasetArn"] } },
      SolutionRef: { Value: { Ref: "RelatedItems" } },
      SolutionArn: { Value: { "Fn::GetAtt": ["RelatedItems", "SolutionArn"] } },
      TrackerRef: { Value: { Ref: "CatalogueEvents" } },
      TrackerArn: {
        Value: { "Fn::GetAtt": ["CatalogueEvents", "EventTrackerArn"] },
      },
      TrackingId: {
        Value: { "Fn::GetAtt": ["CatalogueEvents", "TrackingId"] },
      },
    },
  };
}

/** One Stack Output, which every one in these templates is a string. */
function outputValue(stack: SimCfnDeployedStack, name: string): string {
  const value = stack.outputs.get(name)?.value;

  assertTypeString(value);

  return value;
}

async function deployCatalogue(): Promise<{
  readonly simAws: SimAws;
  readonly stack: SimCfnDeployedStack;
}> {
  const simAws = new SimAws();
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "catalogue-stack",
    template: catalogueTemplate(similarItemsRecipe),
  });

  return { simAws, stack };
}

describe("AWS::Personalize Resources a template declares", () => {
  it("deploys the whole chain a template declares", async () => {
    // Given a template declaring a dataset group, a schema, a dataset, a
    // solution and an event tracker.
    const { simAws, stack } = await deployCatalogue();

    // Then every one of them is simulated Personalize state, rather than a
    // Resource the stack stepped over.
    const personalize = simAws.personalize();

    assertArrayLength(stack.skippedResources, 0);
    assertNonNullable(personalize.findDatasetGroup("catalogue"));
    assertNonNullable(personalize.findSolution("related-items"));

    const listed = await personalize.listDatasets({ input: {} });

    assertArrayLength(listed.datasets, 1);
    assertIdentical(listed.datasets[0].name, "views");
  });

  it("answers a Ref with the name and a GetAtt with the ARN", async () => {
    // Given the deployed chain, whose outputs read both off every Resource.
    const { stack } = await deployCatalogue();

    // Then each Ref is the resource name, which is the way round real
    // Personalize publishes them.
    assertIdentical(outputValue(stack, "GroupRef"), "catalogue");
    assertIdentical(outputValue(stack, "SchemaRef"), "interactions");
    assertIdentical(outputValue(stack, "DatasetRef"), "views");
    assertIdentical(outputValue(stack, "SolutionRef"), "related-items");
    assertIdentical(outputValue(stack, "TrackerRef"), "catalogue-events");

    // And each GetAtt is the ARN of the resource that was created.
    assertStringIncludes(
      outputValue(stack, "GroupArn"),
      ":dataset-group/catalogue",
    );
    assertStringIncludes(
      outputValue(stack, "SchemaArn"),
      ":schema/interactions",
    );
    assertStringIncludes(
      outputValue(stack, "DatasetArn"),
      ":dataset/catalogue/INTERACTIONS",
    );
    assertStringIncludes(
      outputValue(stack, "SolutionArn"),
      ":solution/related-items",
    );
    assertStringIncludes(
      outputValue(stack, "TrackerArn"),
      ":event-tracker/catalogue-events",
    );
  });

  it("deploys a solution after the dataset group it names", async () => {
    // Given the deployed chain, where the solution reaches its group through
    // an Fn::GetAtt.
    const { simAws } = await deployCatalogue();

    // Then the solution is on the group the template pointed it at. A solution
    // deployed before its group would have been refused outright, since
    // CreateSolution resolves the ARN.
    const datasetGroup = simAws.personalize().findDatasetGroup("catalogue");
    const solution = simAws.personalize().findSolution("related-items");

    assertNonNullable(datasetGroup);
    assertNonNullable(solution);
    assertIdentical(solution.datasetGroupArn, datasetGroup.arn);
    assertIdentical(solution.recipeArn, similarItemsRecipe);
  });

  it("gives the event tracker a tracking ID PutEvents can name", async () => {
    // Given the deployed chain, whose tracking ID is an output.
    const { simAws, stack } = await deployCatalogue();
    const trackingId = outputValue(stack, "TrackingId");

    // Then it is the tracking ID of the tracker the stack made, which is what
    // a PutEvents request carries.
    const described = await simAws.personalize().describeEventTracker({
      input: { eventTrackerArn: outputValue(stack, "TrackerArn") },
    });

    assertIdentical(described.eventTracker?.trackingId, trackingId);
  });

  it("deploys a dataset group declaring a domain as a domain group", async () => {
    // Given a template declaring the domain, which is what makes a group a
    // Domain dataset group rather than a custom one.
    const simAws = new SimAws();
    await simAws.cloudFormation().deployTemplate({
      stackName: "storefront-stack",
      template: {
        Resources: {
          Storefront: {
            Type: "AWS::Personalize::DatasetGroup",
            Properties: {
              Name: "storefront",
              Domain: "ECOMMERCE",
              RoleArn: "arn:aws:iam::123456789012:role/personalize",
              KmsKeyArn: "arn:aws:kms:eu-west-2:123456789012:key/abc",
            },
          },
        },
      },
    });

    // Then the domain, the role and the key are all on the group.
    const datasetGroup = simAws.personalize().findDatasetGroup("storefront");

    assertNonNullable(datasetGroup);
    assertIdentical(datasetGroup.domain, "ECOMMERCE");
    assertIdentical(
      datasetGroup.roleArn,
      "arn:aws:iam::123456789012:role/personalize",
    );
    assertIdentical(
      datasetGroup.kmsKeyArn,
      "arn:aws:kms:eu-west-2:123456789012:key/abc",
    );
  });

  it("records a Tags property rather than acting on it", async () => {
    // Given a template tagging the dataset group it declares.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "catalogue-stack",
      template: {
        Resources: {
          Catalogue: {
            Type: "AWS::Personalize::DatasetGroup",
            Properties: {
              Name: "catalogue",
              Tags: [{ Key: "team", Value: "search" }],
            },
          },
        },
      },
    });

    // Then the group deployed, with the tag recorded as something it was
    // created without. No simulated service reads a Personalize tag, and a
    // whole template should not sink over one.
    assertNonNullable(simAws.personalize().findDatasetGroup("catalogue"));
    assertArrayEquals(
      stack.ignoredProperties.map((property) => property.path),
      ["Tags"],
    );
    assertIdentical(
      stack.ignoredProperties[0]?.reason,
      "no simulated service reads a Personalize resource tag",
    );
  });

  it("replaces a solution the updated template changes the recipe of", async () => {
    // Given the deployed chain on the similar items recipe.
    const { simAws } = await deployCatalogue();
    const cloudFormation = simAws.cloudFormation();

    // When the stack is updated onto a different recipe.
    const updated = catalogueTemplate(userPersonalizationRecipe);

    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "catalogue-stack",
        TemplateBody: jsonStringify(updated),
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("catalogue-stack");
    await simAws.backgroundTasksComplete();

    // Then one solution stands, on the recipe the new template names.
    const listed = await simAws.personalize().listSolutions({ input: {} });
    const solution = simAws.personalize().findSolution("related-items");

    assertArrayLength(listed.solutions, 1);
    assertNonNullable(solution);
    assertIdentical(solution.recipeArn, userPersonalizationRecipe);
  });

  it("removes all five when the stack is deleted", async () => {
    // Given the deployed chain.
    const { simAws } = await deployCatalogue();

    // When the stack is deleted.
    await simAws
      .cloudFormation()
      .deleteStack(new DeleteStackCommand({ StackName: "catalogue-stack" }));
    await simAws.backgroundTasksComplete();

    // Then nothing is left. Teardown runs in reverse dependency order, which
    // is what Personalize needs: a dataset group holding a dataset, a solution
    // or a tracker refuses to be deleted.
    const personalize = simAws.personalize();
    const groups = await personalize.listDatasetGroups({ input: {} });
    const schemas = await personalize.listSchemas({ input: {} });
    const datasets = await personalize.listDatasets({ input: {} });
    const solutions = await personalize.listSolutions({ input: {} });
    const trackers = await personalize.listEventTrackers({ input: {} });

    assertArrayLength(groups.datasetGroups, 0);
    assertArrayLength(schemas.schemas, 0);
    assertArrayLength(datasets.datasets, 0);
    assertArrayLength(solutions.solutions, 0);
    assertArrayLength(trackers.eventTrackers, 0);
  });
});
