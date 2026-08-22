import {
  CreateCampaignCommand,
  CreateDatasetGroupCommand,
  CreateDatasetCommand,
  CreateSchemaCommand,
  CreateSolutionCommand,
  CreateSolutionVersionCommand,
  DeleteCampaignCommand,
  DeleteDatasetGroupCommand,
  DeleteDatasetCommand,
  DeleteSchemaCommand,
  DeleteSolutionCommand,
  DescribeCampaignCommand,
  DescribeDatasetGroupCommand,
  DescribeDatasetCommand,
  DescribeSchemaCommand,
  DescribeSolutionCommand,
  DescribeSolutionVersionCommand,
  ListCampaignsCommand,
  ListDatasetGroupsCommand,
  ListDatasetsCommand,
  ListSchemasCommand,
  ListSolutionVersionsCommand,
  ListSolutionsCommand,
  PersonalizeClient,
} from "@aws-sdk/client-personalize";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";

const similarItemsRecipe = "arn:aws:personalize:::recipe/aws-similar-items";
const schemaDocument = JSON.stringify({ type: "record", fields: [] });

describe("Personalize SDK interception", () => {
  it("routes an intercepted PersonalizeClient to simulated Personalize", async () => {
    // Given an intercepted Personalize SDK client.
    const simSdk = new SimSdk();
    simSdk.intercept(PersonalizeClient);

    const client = new PersonalizeClient({ region: "eu-west-2" });

    try {
      // When ordinary SDK code walks the chain to a campaign.
      const group = await client.send(
        new CreateDatasetGroupCommand({ name: "lessons" }),
      );
      const solution = await client.send(
        new CreateSolutionCommand({
          name: "related-lessons",
          datasetGroupArn: group.datasetGroupArn,
          recipeArn: similarItemsRecipe,
        }),
      );
      const version = await client.send(
        new CreateSolutionVersionCommand({ solutionArn: solution.solutionArn }),
      );
      const campaign = await client.send(
        new CreateCampaignCommand({
          name: "related-lessons",
          solutionVersionArn: version.solutionVersionArn,
        }),
      );
      const described = await client.send(
        new DescribeCampaignCommand({ campaignArn: campaign.campaignArn }),
      );

      // Then it all works with nothing touching the network.
      assertNonNullable(described.campaign);
      assertIdentical(described.campaign.status, "ACTIVE");
      assertIdentical(
        described.campaign.solutionVersionArn,
        version.solutionVersionArn,
      );
    } finally {
      simSdk.restoreAll();
    }
  });

  it("routes every supported Command through the intercepted client", async () => {
    // Given an intercepted Personalize SDK client.
    const simSdk = new SimSdk();
    simSdk.intercept(PersonalizeClient);

    const client = new PersonalizeClient({ region: "eu-west-2" });

    try {
      // When every Command simulated Personalize supports is sent.
      const group = await client.send(
        new CreateDatasetGroupCommand({ name: "lessons" }),
      );
      const schema = await client.send(
        new CreateSchemaCommand({
          name: "interactions",
          schema: schemaDocument,
        }),
      );
      const dataset = await client.send(
        new CreateDatasetCommand({
          name: "lesson-views",
          datasetGroupArn: group.datasetGroupArn,
          schemaArn: schema.schemaArn,
          datasetType: "Interactions",
        }),
      );
      const solution = await client.send(
        new CreateSolutionCommand({
          name: "related-lessons",
          datasetGroupArn: group.datasetGroupArn,
          recipeArn: similarItemsRecipe,
        }),
      );
      const version = await client.send(
        new CreateSolutionVersionCommand({ solutionArn: solution.solutionArn }),
      );
      const campaign = await client.send(
        new CreateCampaignCommand({
          name: "related-lessons",
          solutionVersionArn: version.solutionVersionArn,
        }),
      );

      await client.send(
        new DescribeDatasetGroupCommand({
          datasetGroupArn: group.datasetGroupArn,
        }),
      );
      await client.send(
        new DescribeSchemaCommand({ schemaArn: schema.schemaArn }),
      );
      await client.send(
        new DescribeDatasetCommand({ datasetArn: dataset.datasetArn }),
      );
      await client.send(
        new DescribeSolutionCommand({ solutionArn: solution.solutionArn }),
      );
      await client.send(
        new DescribeSolutionVersionCommand({
          solutionVersionArn: version.solutionVersionArn,
        }),
      );

      const datasetGroups = await client.send(new ListDatasetGroupsCommand({}));
      const schemas = await client.send(new ListSchemasCommand({}));
      const datasets = await client.send(new ListDatasetsCommand({}));
      const solutions = await client.send(new ListSolutionsCommand({}));
      const versions = await client.send(new ListSolutionVersionsCommand({}));
      const campaigns = await client.send(new ListCampaignsCommand({}));

      await client.send(
        new DeleteCampaignCommand({ campaignArn: campaign.campaignArn }),
      );
      await client.send(
        new DeleteSolutionCommand({ solutionArn: solution.solutionArn }),
      );
      await client.send(
        new DeleteDatasetCommand({ datasetArn: dataset.datasetArn }),
      );
      await client.send(
        new DeleteSchemaCommand({ schemaArn: schema.schemaArn }),
      );
      await client.send(
        new DeleteDatasetGroupCommand({
          datasetGroupArn: group.datasetGroupArn,
        }),
      );

      // Then each one reached the simulation and the scope is empty again.
      assertArrayLength(datasetGroups.datasetGroups ?? [], 1);
      assertArrayLength(schemas.schemas ?? [], 1);
      assertArrayLength(datasets.datasets ?? [], 1);
      assertArrayLength(solutions.solutions ?? [], 1);
      assertArrayLength(versions.solutionVersions ?? [], 1);
      assertArrayLength(campaigns.campaigns ?? [], 1);

      const remaining = await client.send(new ListDatasetGroupsCommand({}));
      assertArrayLength(remaining.datasetGroups ?? [], 0);
    } finally {
      simSdk.restoreAll();
    }
  });

  it("supports the Commands its router names and no others", () => {
    // Given a simulated Personalize.
    const simAws = new SimAws();

    // When its router is asked what it handles.
    const supported = simAws.personalize().sdkCommandRouter();

    // Then every name is one the router has a route for.
    for (const commandName of supported.supportedCommandNames()) {
      assertNonNullable(supported.route(commandName));
    }

    // And a Command that belongs to a Personalize API of its own is not one
    // of them. PutEvents arrives on the events client.
    assertUndefined(supported.route("PutEventsCommand"));
    assertArrayLength(supported.supportedCommandNames(), 34);
  });
});
