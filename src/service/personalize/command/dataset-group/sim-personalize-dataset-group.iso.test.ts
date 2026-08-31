import {
  CreateDatasetGroupCommand,
  DeleteDatasetGroupCommand,
  DescribeDatasetGroupCommand,
  ListDatasetGroupsCommand,
} from "@aws-sdk/client-personalize";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

const accountIdOneOnes = "111111111111";

describe("Personalize CreateDatasetGroup", () => {
  it("gives the dataset group an ARN naming its account and region", async () => {
    // Given a simulated AWS in a known Account and Region.
    const simAws = new SimAws({
      defaultAccountId: accountIdOneOnes,
      defaultRegionName: "eu-west-2",
    });

    // When a dataset group is created.
    const created = await simAws
      .personalize()
      .createDatasetGroup(new CreateDatasetGroupCommand({ name: "lessons" }));

    // Then its ARN is the one real Personalize would have built.
    assertIdentical(
      created.datasetGroupArn,
      "arn:aws:personalize:eu-west-2:111111111111:dataset-group/lessons",
    );
  });

  it("leaves a dataset group created without a domain custom", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a dataset group is created with no domain.
    const created = await simAws
      .personalize()
      .createDatasetGroup(new CreateDatasetGroupCommand({ name: "lessons" }));

    // Then it carries no domain, which is what makes it a custom one.
    assertUndefined(created.domain);
  });

  it("records the domain of a domain dataset group", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a dataset group is created for a domain.
    const created = await simAws.personalize().createDatasetGroup(
      new CreateDatasetGroupCommand({
        name: "catalogue",
        domain: "ECOMMERCE",
      }),
    );

    // Then the domain comes back with it.
    assertIdentical(created.domain, "ECOMMERCE");
  });

  it("refuses a domain Personalize has no use cases for", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a dataset group is created for a domain that does not exist. The
    // SDK's own types rule this out, so it reaches the simulator the way an
    // untyped caller would, as request input.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalize().createDatasetGroup({
          input: { name: "dictionary", domain: "DICTIONARY" },
        }),
    );

    // Then Personalize refuses it as invalid input.
    assertIdentical(error.name, "InvalidInputException");
  });

  it("refuses a second dataset group of the same name", async () => {
    // Given a simulated AWS holding a dataset group.
    const simAws = new SimAws();
    await simAws
      .personalize()
      .createDatasetGroup(new CreateDatasetGroupCommand({ name: "lessons" }));

    // When a second one is created with that name.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalize()
          .createDatasetGroup(
            new CreateDatasetGroupCommand({ name: "lessons" }),
          ),
    );

    // Then Personalize refuses it as one that already exists.
    assertIdentical(error.name, "ResourceAlreadyExistsException");
  });

  it("refuses a name breaking the Personalize name pattern", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a dataset group is created with a name starting with a hyphen.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalize()
          .createDatasetGroup(
            new CreateDatasetGroupCommand({ name: "-lessons" }),
          ),
    );

    // Then Personalize refuses it as invalid input.
    assertIdentical(error.name, "InvalidInputException");
  });
});

describe("Personalize DescribeDatasetGroup", () => {
  it("reports an active dataset group back with what created it", async () => {
    // Given a simulated AWS holding a dataset group.
    const simAws = new SimAws();
    const created = await simAws.personalize().createDatasetGroup(
      new CreateDatasetGroupCommand({
        name: "lessons",
        roleArn: "arn:aws:iam::111111111111:role/personalize",
      }),
    );

    // When it is described.
    const described = await simAws.personalize().describeDatasetGroup(
      new DescribeDatasetGroupCommand({
        datasetGroupArn: created.datasetGroupArn,
      }),
    );

    // Then it is active straight away, with no training to wait for.
    assertNonNullable(described.datasetGroup);
    assertIdentical(described.datasetGroup.name, "lessons");
    assertIdentical(described.datasetGroup.status, "ACTIVE");
    assertIdentical(
      described.datasetGroup.roleArn,
      "arn:aws:iam::111111111111:role/personalize",
    );
  });

  it("refuses an ARN no dataset group answers to", async () => {
    // Given a simulated AWS holding no dataset groups.
    const simAws = new SimAws();

    // When an absent one is described.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalize().describeDatasetGroup(
          new DescribeDatasetGroupCommand({
            datasetGroupArn:
              "arn:aws:personalize:eu-west-2:111111111111:dataset-group/gone",
          }),
        ),
    );

    // Then Personalize reports it as missing.
    assertIdentical(error.name, "ResourceNotFoundException");
  });

  it("refuses a value that is not a Personalize ARN at all", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When something other than a Personalize ARN is described.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalize()
          .describeDatasetGroup(
            new DescribeDatasetGroupCommand({ datasetGroupArn: "lessons" }),
          ),
    );

    // Then Personalize refuses the input rather than reporting it missing.
    assertIdentical(error.name, "InvalidInputException");
  });
});

describe("Personalize ListDatasetGroups", () => {
  it("lists the dataset groups in creation order", async () => {
    // Given a simulated AWS holding two dataset groups.
    const simAws = new SimAws();
    await simAws
      .personalize()
      .createDatasetGroup(new CreateDatasetGroupCommand({ name: "lessons" }));
    await simAws
      .personalize()
      .createDatasetGroup(new CreateDatasetGroupCommand({ name: "words" }));

    // When they are listed.
    const listed = await simAws
      .personalize()
      .listDatasetGroups(new ListDatasetGroupsCommand({}));

    // Then both come back in the order they were created.
    assertNonNullable(listed.datasetGroups);
    assertArrayLength(listed.datasetGroups, 2);
    assertIdentical(listed.datasetGroups[0].name, "lessons");
    assertIdentical(listed.datasetGroups[1].name, "words");
    assertUndefined(listed.nextToken);
  });

  it("hands back a token when a page leaves some behind", async () => {
    // Given a simulated AWS holding two dataset groups.
    const simAws = new SimAws();
    await simAws
      .personalize()
      .createDatasetGroup(new CreateDatasetGroupCommand({ name: "lessons" }));
    await simAws
      .personalize()
      .createDatasetGroup(new CreateDatasetGroupCommand({ name: "words" }));

    // When one is listed at a time.
    const first = await simAws
      .personalize()
      .listDatasetGroups(new ListDatasetGroupsCommand({ maxResults: 1 }));
    assertNonNullable(first.nextToken);
    const second = await simAws.personalize().listDatasetGroups(
      new ListDatasetGroupsCommand({
        maxResults: 1,
        nextToken: first.nextToken,
      }),
    );

    // Then the token carries on where the first page stopped.
    assertIdentical(first.datasetGroups?.at(0)?.name, "lessons");
    assertIdentical(second.datasetGroups?.at(0)?.name, "words");
    assertUndefined(second.nextToken);
  });
});

describe("Personalize DeleteDatasetGroup", () => {
  it("forgets a dataset group holding nothing", async () => {
    // Given a simulated AWS holding a dataset group.
    const simAws = new SimAws();
    const created = await simAws
      .personalize()
      .createDatasetGroup(new CreateDatasetGroupCommand({ name: "lessons" }));

    // When it is deleted.
    await simAws.personalize().deleteDatasetGroup(
      new DeleteDatasetGroupCommand({
        datasetGroupArn: created.datasetGroupArn,
      }),
    );

    // Then nothing is left to list.
    const listed = await simAws
      .personalize()
      .listDatasetGroups(new ListDatasetGroupsCommand({}));
    assertArrayEmpty(listed.datasetGroups ?? []);
  });
});
