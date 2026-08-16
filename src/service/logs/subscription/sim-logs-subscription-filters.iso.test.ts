import {
  CreateLogGroupCommand,
  DeleteSubscriptionFilterCommand,
  DescribeSubscriptionFiltersCommand,
  PutSubscriptionFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import {
  SimLogsInvalidParameterException,
  SimLogsLimitExceededException,
  SimLogsResourceNotFoundException,
} from "../error/sim-logs.error.js";

const logGroupName = "/aws/lambda/orders";

/**
 * A simulation with a log group and two tracker functions that both admit
 * CloudWatch Logs.
 */
async function simAwsWithTrackers(): Promise<SimAws> {
  const simAws = new SimAws();

  for (const functionName of ["tracker-one", "tracker-two"]) {
    // oxlint-disable-next-line no-await-in-loop -- each function is set up before the next
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Role: `arn:aws:iam::${simAws.defaultAccountId}:role/TrackerRole`,
        Code: { ZipFile: makeLambdaZipFileInput(() => "recorded") },
      }),
    );
    // oxlint-disable-next-line no-await-in-loop -- each function is set up before the next
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: functionName,
        StatementId: "logs",
        Action: "lambda:InvokeFunction",
        Principal: `logs.${simAws.defaultRegionName}.amazonaws.com`,
      }),
    );
  }

  await simAws.backgroundTasksComplete();
  await simAws
    .logs()
    .createLogGroup(new CreateLogGroupCommand({ logGroupName }));

  return simAws;
}

function trackerArn(simAws: SimAws, functionName: string): string {
  return `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:${functionName}`;
}

async function putFilter(
  simAws: SimAws,
  filterName: string,
  functionName = "tracker-one",
  filterPattern?: string,
): Promise<void> {
  await simAws.logs().putSubscriptionFilter(
    new PutSubscriptionFilterCommand({
      logGroupName,
      filterName,
      filterPattern,
      destinationArn: trackerArn(simAws, functionName),
    }),
  );
}

describe("CloudWatch Logs subscription filters", () => {
  it("describes a filter it was given", async () => {
    // Given a filter on a log group.
    const simAws = await simAwsWithTrackers();

    await putFilter(simAws, "errors-to-tracker", "tracker-one", "ERROR");

    // When the filters are described.
    const described = await simAws
      .logs()
      .describeSubscriptionFilters(
        new DescribeSubscriptionFiltersCommand({ logGroupName }),
      );
    const filter = described.subscriptionFilters?.at(0);

    // Then it reports what was put, so a test can assert on the wiring a stack
    // or a setup step made.
    assertNonNullable(filter);
    assertIdentical(filter.filterName, "errors-to-tracker");
    assertIdentical(filter.logGroupName, logGroupName);
    assertIdentical(filter.filterPattern, "ERROR");
    assertIdentical(filter.destinationArn, trackerArn(simAws, "tracker-one"));
  });

  it("replaces a filter of the same name rather than adding one", async () => {
    // Given a filter that has been put twice under one name.
    const simAws = await simAwsWithTrackers();

    await putFilter(simAws, "errors", "tracker-one", "ERROR");
    await putFilter(simAws, "errors", "tracker-two", "WARN");

    // When the filters are described.
    const described = await simAws
      .logs()
      .describeSubscriptionFilters(
        new DescribeSubscriptionFiltersCommand({ logGroupName }),
      );

    // Then the second put changed the first, which is what makes
    // PutSubscriptionFilter the way to change a pattern.
    assertArrayEquals(
      described.subscriptionFilters?.map((filter) => filter.filterPattern),
      ["WARN"],
    );
    assertIdentical(
      described.subscriptionFilters.at(0)?.destinationArn,
      trackerArn(simAws, "tracker-two"),
    );
  });

  it("refuses more filters than a log group may have", async () => {
    // Given a log group with the two filters AWS allows.
    const simAws = await simAwsWithTrackers();

    await putFilter(simAws, "errors");
    await putFilter(simAws, "warnings");

    // When a third is put.
    const error = await assertThrowsErrorAsync(async () => {
      await putFilter(simAws, "everything");
    });

    // Then it is refused, as an account refuses it.
    assertInstanceOf(error, SimLogsLimitExceededException);
    assertStringIncludes(error.message, "at most 2 subscription filters");
  });

  it("removes a filter, and refuses to remove one that is not there", async () => {
    // Given one filter.
    const simAws = await simAwsWithTrackers();

    await putFilter(simAws, "errors");

    // When it is deleted, and then deleted again.
    await simAws.logs().deleteSubscriptionFilter(
      new DeleteSubscriptionFilterCommand({
        logGroupName,
        filterName: "errors",
      }),
    );
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.logs().deleteSubscriptionFilter(
          new DeleteSubscriptionFilterCommand({
            logGroupName,
            filterName: "errors",
          }),
        ),
    );

    // Then the first went and the second failed as an unknown filter.
    const described = await simAws
      .logs()
      .describeSubscriptionFilters(
        new DescribeSubscriptionFiltersCommand({ logGroupName }),
      );

    assertArrayEquals(described.subscriptionFilters ?? [], []);
    assertInstanceOf(error, SimLogsResourceNotFoundException);
  });

  it("describes filters under a name prefix", async () => {
    // Given two filters with different name prefixes.
    const simAws = await simAwsWithTrackers();

    await putFilter(simAws, "errors-to-tracker");
    await putFilter(simAws, "warnings-to-tracker");

    // When one prefix is described.
    const described = await simAws.logs().describeSubscriptionFilters(
      new DescribeSubscriptionFiltersCommand({
        logGroupName,
        filterNamePrefix: "errors-",
      }),
    );

    // Then only that one is reported.
    assertArrayEquals(
      described.subscriptionFilters?.map((filter) => filter.filterName),
      ["errors-to-tracker"],
    );
  });

  it("refuses a filter on a log group that is not there", async () => {
    // Given a simulation whose tracker exists but whose log group does not.
    const simAws = await simAwsWithTrackers();

    // When a filter is put on another group.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.logs().putSubscriptionFilter(
          new PutSubscriptionFilterCommand({
            logGroupName: "/aws/lambda/billing",
            filterName: "errors",
            filterPattern: "",
            destinationArn: trackerArn(simAws, "tracker-one"),
          }),
        ),
    );

    // Then it fails as an unknown log group.
    assertInstanceOf(error, SimLogsResourceNotFoundException);
  });

  it("refuses a filter missing the parts it is identified by", async () => {
    // Given a log group.
    const simAws = await simAwsWithTrackers();

    // When a filter is put with no name, and one with no destination.
    const noName = await assertThrowsErrorAsync(
      async () =>
        await simAws.logs().putSubscriptionFilter({
          input: {
            logGroupName,
            destinationArn: trackerArn(simAws, "tracker-one"),
          },
        }),
    );
    const noDestination = await assertThrowsErrorAsync(
      async () =>
        await simAws.logs().putSubscriptionFilter({
          input: { logGroupName, filterName: "errors" },
        }),
    );

    // Then each names the part that was missing.
    assertInstanceOf(noName, SimLogsInvalidParameterException);
    assertInstanceOf(noDestination, SimLogsInvalidParameterException);
    assertStringIncludes(noName.message, "filterName");
    assertStringIncludes(noDestination.message, "destinationArn");
  });

  it("refuses a destination naming a function version", async () => {
    // Given a log group and a qualified function ARN.
    const simAws = await simAwsWithTrackers();

    // When a filter is put on it.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.logs().putSubscriptionFilter(
          new PutSubscriptionFilterCommand({
            logGroupName,
            filterName: "errors",
            filterPattern: "",
            destinationArn: `${trackerArn(simAws, "tracker-one")}:1`,
          }),
        ),
    );

    // Then it is refused, because simulated Lambda has no versions and
    // delivering to the unqualified function would be a different one.
    assertInstanceOf(error, SimLogsInvalidParameterException);
    assertStringIncludes(error.message, "version or alias");
  });

  it("refuses a destination in another Account or Region", async () => {
    // Given a log group and function ARNs outside its own scope.
    const simAws = await simAwsWithTrackers();
    const otherAccount = `arn:aws:lambda:${simAws.defaultRegionName}:222222222222:function:tracker-one`;
    const otherRegion = `arn:aws:lambda:eu-west-2:${simAws.defaultAccountId}:function:tracker-one`;

    // When each is used as a destination.
    const crossAccount = await assertThrowsErrorAsync(
      async () =>
        await simAws.logs().putSubscriptionFilter(
          new PutSubscriptionFilterCommand({
            logGroupName,
            filterName: "errors",
            filterPattern: "",
            destinationArn: otherAccount,
          }),
        ),
    );
    const crossRegion = await assertThrowsErrorAsync(
      async () =>
        await simAws.logs().putSubscriptionFilter(
          new PutSubscriptionFilterCommand({
            logGroupName,
            filterName: "errors",
            filterPattern: "",
            destinationArn: otherRegion,
          }),
        ),
    );

    // Then both are refused. Real CloudWatch Logs takes a Lambda destination
    // belonging to the same Account as the subscription filter, and reaches
    // another one only through a logical destination.
    assertInstanceOf(crossAccount, SimLogsInvalidParameterException);
    assertInstanceOf(crossRegion, SimLogsInvalidParameterException);
    assertStringIncludes(crossAccount.message, "same Account");
    assertStringIncludes(crossRegion.message, "same Region");
  });

  it("takes a log group's filters down with it", async () => {
    // Given a filter on a log group.
    const simAws = await simAwsWithTrackers();

    await putFilter(simAws, "errors");

    // When the group is deleted and made again.
    await simAws.logs().deleteLogGroup({ input: { logGroupName } });
    await simAws
      .logs()
      .createLogGroup(new CreateLogGroupCommand({ logGroupName }));

    // Then the filter went with the group, as it does in an account.
    const described = await simAws
      .logs()
      .describeSubscriptionFilters(
        new DescribeSubscriptionFiltersCommand({ logGroupName }),
      );

    assertArrayEquals(described.subscriptionFilters ?? [], []);
  });
});
