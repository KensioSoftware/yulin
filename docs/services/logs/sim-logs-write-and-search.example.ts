/**
 * Writing log events to a simulated log group and searching for one.
 */

import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  FilterLogEventsCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const logs = simAws.logs();

const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/16/[$LATEST]0f7c1a";

await logs.createLogGroup(new CreateLogGroupCommand({ logGroupName }));
await logs.createLogStream(
  new CreateLogStreamCommand({ logGroupName, logStreamName }),
);

await logs.putLogEvents(
  new PutLogEventsCommand({
    logGroupName,
    logStreamName,
    logEvents: [
      {
        timestamp: Date.parse("2026-08-16T09:00:00Z"),
        message: "INFO handling order-1",
      },
      {
        timestamp: Date.parse("2026-08-16T09:00:01Z"),
        message: "ERROR order has no items",
      },
    ],
  }),
);

const found = await logs.filterLogEvents(
  new FilterLogEventsCommand({ logGroupName, filterPattern: "ERROR" }),
);

// One event, from the stream that wrote it.
console.log(found.events?.length, found.events?.[0]?.logStreamName);
