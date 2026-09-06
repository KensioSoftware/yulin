import { assertUndefined } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { simLogsParsedLogGroupArn } from "./sim-logs-arn.js";

const logGroupArn =
  "arn:aws:logs:us-east-1:111111111111:log-group:/aws/vendedlogs/orders";

describe("Reading a CloudWatch Logs log group ARN", () => {
  it("reads the account, region and name off both written forms", () => {
    // Given the form DescribeLogGroups reports and the form CDK emits, which
    // carries the wildcard covering the group's streams

    // When each is read
    const reported = simLogsParsedLogGroupArn(logGroupArn);
    const withWildcard = simLogsParsedLogGroupArn(`${logGroupArn}:*`);

    // Then both name the same group
    const parsed = {
      accountId: "111111111111",
      regionName: "us-east-1",
      logGroupName: "/aws/vendedlogs/orders",
    };
    expect(reported).toStrictEqual(parsed);
    expect(withWildcard).toStrictEqual(parsed);
  });

  it("reads nothing from a string that is not a log group ARN", () => {
    // Given strings that each fail one part of the shape

    // When each is read

    // Then none of them names a group. A string merely ending in something
    // ARN-shaped is the one worth naming: it would otherwise be accepted as a
    // destination that could never be written to.
    assertUndefined(
      simLogsParsedLogGroupArn(`not-an-${logGroupArn}`),
      "an ARN not starting with the arn prefix",
    );
    assertUndefined(
      simLogsParsedLogGroupArn("arn:aws:logs::111111111111:log-group:orders"),
      "an ARN with no region",
    );
    assertUndefined(
      simLogsParsedLogGroupArn("arn:aws:logs:us-east-1::log-group:orders"),
      "an ARN with no account",
    );
    assertUndefined(
      simLogsParsedLogGroupArn("arn:aws:s3:::orders"),
      "an ARN of another service",
    );
    assertUndefined(
      simLogsParsedLogGroupArn(
        "arn:aws:logs:us-east-1:111111111111:delivery-source:orders",
      ),
      "a CloudWatch Logs ARN of another resource type",
    );
    assertUndefined(
      simLogsParsedLogGroupArn(
        "arn:aws:logs:us-east-1:111111111111:log-group:",
      ),
      "an ARN with no group name",
    );
  });
});
