/**
 * Paging through one simulated log stream from the oldest event.
 */

import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  GetLogEventsCommand,
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
    logEvents: [1, 2, 3, 4, 5].map((second) => ({
      timestamp: Date.parse("2026-08-16T09:00:00Z") + second * 1000,
      message: `line ${second}`,
    })),
  }),
);

let nextToken: string | undefined;
const read: string[] = [];

for (;;) {
  const page = await logs.getLogEvents(
    new GetLogEventsCommand({
      logGroupName,
      logStreamName,
      startFromHead: true,
      limit: 2,
      nextToken,
    }),
  );

  if (page.events === undefined || page.events.length === 0) break;

  read.push(...page.events.map((event) => event.message));
  nextToken = page.nextForwardToken;
}

console.log(read);
