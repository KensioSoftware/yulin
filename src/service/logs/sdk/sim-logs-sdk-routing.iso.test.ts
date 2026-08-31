import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  DeleteLogGroupCommand,
  DeleteRetentionPolicyCommand,
  DescribeLogGroupsCommand,
  DescribeLogStreamsCommand,
  FilterLogEventsCommand,
  GetLogEventsCommand,
  PutLogEventsCommand,
  PutRetentionPolicyCommand,
  PutSubscriptionFilterCommand,
  DescribeSubscriptionFiltersCommand,
  DeleteSubscriptionFilterCommand,
  PutMetricFilterCommand,
  DescribeMetricFiltersCommand,
  DeleteMetricFilterCommand,
  CreateDeliveryCommand,
  DeleteDeliveryCommand,
  DeleteDeliveryDestinationCommand,
  DeleteDeliverySourceCommand,
  DescribeDeliveriesCommand,
  DescribeDeliveryDestinationsCommand,
  DescribeDeliverySourcesCommand,
  PutDeliveryDestinationCommand,
  PutDeliverySourceCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayIncludesAll,
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import { simLogsDeliveryDistributionArn } from "../../../../test/logs/delivery-distribution-fixture.js";

const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/16/[$LATEST]abc";

describe("SimLogsSdkCommandRouter", () => {
  it("names every Command simulated CloudWatch Logs handles", () => {
    // Given a scoped simulated CloudWatch Logs.
    const simAws = new SimAws();

    // When its supported Command names are asked for.
    const names = simAws.logs().sdkCommandRouter().supportedCommandNames();

    // Then each simulated operation is routable by SDK Command name.
    assertArrayIncludesAll(names, [
      "CreateLogGroupCommand",
      "DeleteLogGroupCommand",
      "DescribeLogGroupsCommand",
      "PutRetentionPolicyCommand",
      "DeleteRetentionPolicyCommand",
      "CreateLogStreamCommand",
      "DescribeLogStreamsCommand",
      "PutLogEventsCommand",
      "GetLogEventsCommand",
      "FilterLogEventsCommand",
      "PutSubscriptionFilterCommand",
      "DescribeSubscriptionFiltersCommand",
      "DeleteSubscriptionFilterCommand",
      "PutMetricFilterCommand",
      "DescribeMetricFiltersCommand",
      "DeleteMetricFilterCommand",
      "PutDeliverySourceCommand",
      "DescribeDeliverySourcesCommand",
      "DeleteDeliverySourceCommand",
      "PutDeliveryDestinationCommand",
      "DescribeDeliveryDestinationsCommand",
      "DeleteDeliveryDestinationCommand",
      "CreateDeliveryCommand",
      "DescribeDeliveriesCommand",
      "DeleteDeliveryCommand",
    ]);
  });

  it("has no route for a Command it does not handle", () => {
    // Given a scoped simulated CloudWatch Logs.
    const simAws = new SimAws();

    // When a CloudWatch Logs Command outside what is simulated is looked up.
    const route = simAws.logs().sdkCommandRouter().route("StartQueryCommand");

    // Then there is no route for it.
    assertUndefined(route);
  });
});

describe("CloudWatch Logs SDK interception", () => {
  it("routes an intercepted CloudWatchLogsClient to simulated CloudWatch Logs", async () => {
    // Given an intercepted CloudWatch Logs SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(CloudWatchLogsClient);

    const client = new CloudWatchLogsClient({ region: "eu-west-2" });

    // When ordinary SDK code writes a log line and searches for it.
    await client.send(new CreateLogGroupCommand({ logGroupName }));
    await client.send(
      new CreateLogStreamCommand({ logGroupName, logStreamName }),
    );
    await client.send(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName,
        logEvents: [{ timestamp: 1000, message: "ERROR order has no items" }],
      }),
    );
    const found = await client.send(
      new FilterLogEventsCommand({ logGroupName, filterPattern: "ERROR" }),
    );

    // Then it works with nothing touching the network, and the ARN names the
    // Region the client was configured for.
    const described = await client.send(new DescribeLogGroupsCommand({}));

    assertArrayLength(found.events ?? [], 1);
    assertStringIncludes(
      String(described.logGroups?.at(0)?.logGroupArn),
      "arn:aws:logs:eu-west-2:",
    );
  });

  it("routes every remaining Command through the intercepted client", async () => {
    // Given an intercepted client with a log group and stream holding events.
    using simSdk = new SimSdk();
    simSdk.intercept(CloudWatchLogsClient);

    const client = new CloudWatchLogsClient({ region: "eu-west-2" });

    await client.send(new CreateLogGroupCommand({ logGroupName }));
    await client.send(
      new CreateLogStreamCommand({ logGroupName, logStreamName }),
    );
    await client.send(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName,
        logEvents: [{ timestamp: 1000, message: "starting" }],
      }),
    );

    // When each of the remaining operations is used.
    await client.send(
      new PutRetentionPolicyCommand({ logGroupName, retentionInDays: 14 }),
    );
    const withRetention = await client.send(new DescribeLogGroupsCommand({}));
    await client.send(new DeleteRetentionPolicyCommand({ logGroupName }));
    const streams = await client.send(
      new DescribeLogStreamsCommand({ logGroupName }),
    );
    const events = await client.send(
      new GetLogEventsCommand({ logGroupName, logStreamName }),
    );
    await client.send(new DeleteLogGroupCommand({ logGroupName }));
    const afterDelete = await client.send(new DescribeLogGroupsCommand({}));

    // And the subscription filter commands route too, on a group subscribed to
    // a function that admits CloudWatch Logs.
    await client.send(
      new CreateLogGroupCommand({ logGroupName: "/aws/lambda/billing" }),
    );
    const scoped = simSdk.simAws.accountRegionScope(
      simSdk.simAws.defaultAccountId,
      "eu-west-2",
    );

    await scoped.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "error-tracker",
        Role: `arn:aws:iam::${simSdk.simAws.defaultAccountId}:role/TrackerRole`,
        Code: { ZipFile: makeLambdaZipFileInput(() => "recorded") },
      }),
    );
    await scoped.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "error-tracker",
        StatementId: "logs",
        Action: "lambda:InvokeFunction",
        Principal: "logs.eu-west-2.amazonaws.com",
      }),
    );
    await simSdk.simAws.backgroundTasksComplete();

    await client.send(
      new PutSubscriptionFilterCommand({
        logGroupName: "/aws/lambda/billing",
        filterName: "errors",
        filterPattern: "",
        destinationArn: `arn:aws:lambda:eu-west-2:${simSdk.simAws.defaultAccountId}:function:error-tracker`,
      }),
    );
    const filters = await client.send(
      new DescribeSubscriptionFiltersCommand({
        logGroupName: "/aws/lambda/billing",
      }),
    );
    await client.send(
      new DeleteSubscriptionFilterCommand({
        logGroupName: "/aws/lambda/billing",
        filterName: "errors",
      }),
    );
    const afterDeleteFilters = await client.send(
      new DescribeSubscriptionFiltersCommand({
        logGroupName: "/aws/lambda/billing",
      }),
    );

    await client.send(
      new PutMetricFilterCommand({
        logGroupName: "/aws/lambda/billing",
        filterName: "billing-errors",
        filterPattern: "ERROR",
        metricTransformations: [
          {
            metricNamespace: "Billing",
            metricName: "Errors",
            metricValue: "1",
          },
        ],
      }),
    );
    const metricFilters = await client.send(
      new DescribeMetricFiltersCommand({
        logGroupName: "/aws/lambda/billing",
      }),
    );
    await client.send(
      new DeleteMetricFilterCommand({
        logGroupName: "/aws/lambda/billing",
        filterName: "billing-errors",
      }),
    );
    const afterDeleteMetricFilters = await client.send(
      new DescribeMetricFiltersCommand({
        logGroupName: "/aws/lambda/billing",
      }),
    );

    assertArrayEquals(
      filters.subscriptionFilters?.map((filter) => filter.filterName),
      ["errors"],
    );
    assertArrayEmpty(afterDeleteFilters.subscriptionFilters ?? []);
    assertArrayEquals(
      metricFilters.metricFilters?.map((filter) => filter.filterName),
      ["billing-errors"],
    );
    assertArrayEmpty(afterDeleteMetricFilters.metricFilters ?? []);

    // Then each one reached simulated CloudWatch Logs.
    assertIdentical(withRetention.logGroups?.at(0)?.retentionInDays, 14);
    assertArrayEquals(
      streams.logStreams?.map((stream) => stream.logStreamName),
      [logStreamName],
    );
    assertArrayEquals(
      events.events?.map((event) => event.message),
      ["starting"],
    );
    assertArrayEmpty(afterDelete.logGroups ?? []);
  });
});

describe("CloudWatch Logs delivery SDK interception", () => {
  it("sets CloudFront logging up through the intercepted client", async () => {
    // Given an intercepted client in the one Region CloudFront delivery is
    // set up from, and a distribution to deliver the logs of.
    using simSdk = new SimSdk();
    simSdk.intercept(CloudWatchLogsClient);

    const client = new CloudWatchLogsClient({ region: "us-east-1" });
    const resourceArn = await simLogsDeliveryDistributionArn(simSdk.simAws);

    // When ordinary SDK code sets up standard logging v2 for a distribution.
    await client.send(
      new PutDeliverySourceCommand({
        name: "site-access-logs",
        resourceArn,
        logType: "ACCESS_LOGS",
      }),
    );

    const destination = await client.send(
      new PutDeliveryDestinationCommand({
        name: "site-access-logs",
        outputFormat: "json",
        deliveryDestinationConfiguration: {
          destinationResourceArn: "arn:aws:s3:::example-access-logs",
        },
      }),
    );

    await client.send(
      new CreateDeliveryCommand({
        deliverySourceName: "site-access-logs",
        deliveryDestinationArn: destination.deliveryDestination?.arn,
      }),
    );

    // Then all three read back through the same client.
    const sources = await client.send(new DescribeDeliverySourcesCommand({}));
    const destinations = await client.send(
      new DescribeDeliveryDestinationsCommand({}),
    );
    const deliveries = await client.send(new DescribeDeliveriesCommand({}));

    assertArrayLength(sources.deliverySources ?? [], 1);
    assertArrayLength(destinations.deliveryDestinations ?? [], 1);
    assertArrayLength(deliveries.deliveries ?? [], 1);

    // And each can be taken down again.
    await client.send(
      new DeleteDeliveryCommand({ id: deliveries.deliveries?.at(0)?.id }),
    );
    await client.send(
      new DeleteDeliveryDestinationCommand({ name: "site-access-logs" }),
    );
    await client.send(
      new DeleteDeliverySourceCommand({ name: "site-access-logs" }),
    );

    const remaining = await client.send(new DescribeDeliveriesCommand({}));

    assertArrayEmpty(remaining.deliveries ?? []);
  });
});
