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
} from "@aws-sdk/client-cloudwatch-logs";
import {
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
    assertArrayLength(afterDelete.logGroups ?? [], 0);
  });
});
