import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../../aws/sim-aws.js";
import {
  makeSimAwsAccountId,
  type SimAwsAccountId,
} from "../../../../../aws/sim-aws-account.js";
import { SimIam } from "../../../../sim-iam.js";
import { simIamAuthZResourcePolicySourceFactory } from "../../../context/sim-iam-auth-z-context.factory.js";
import type {
  SimIamConditionValue,
  SimIamPolicyDocumentCondition,
} from "../../../../policy/sim-iam-policy.js";

const reportObject = "arn:aws:s3:::reports-bucket/summary.csv";

/**
 * Whether a resource policy allowing a read on one condition allows it, with
 * the request context supplied alongside.
 */
function allowed(
  condition: SimIamPolicyDocumentCondition,
  conditionContext: Readonly<Record<string, SimIamConditionValue>>,
): boolean {
  return new SimIam().authorize({
    action: "s3:GetObject",
    resource: reportObject,
    caller: { kind: "anonymous" },
    conditionContext,
    resourcePolicies: [
      simIamAuthZResourcePolicySourceFactory.make({
        document: {
          Statement: {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: reportObject,
            Condition: condition,
          },
        },
      }),
    ],
  }).isAllowed;
}

/**
 * A simulation whose Account root is denied Bucket creation from the start of
 * 2027.
 */
async function frozenSimulation(): Promise<{
  simAws: SimAws;
  accountId: SimAwsAccountId;
}> {
  const accountId = makeSimAwsAccountId();
  const simAws = new SimAws({ defaultAccountId: accountId });

  await simAws.clock().setTo(new Date("2026-12-31T23:00:00Z"));
  simAws.organizations().attachServiceControlPolicy(accountId, {
    Version: "2012-10-17",
    Statement: {
      Effect: "Deny",
      Action: "s3:CreateBucket",
      Resource: "*",
      Condition: {
        DateGreaterThanEquals: { "aws:CurrentTime": "2027-01-01T00:00:00Z" },
      },
    },
  });

  return { simAws, accountId };
}

describe("sim IAM date condition operators", () => {
  it("compares ISO 8601 dates as instants", () => {
    // Given a read allowed before the start of 2027
    const condition = {
      DateLessThan: { "aws:TokenIssueTime": "2027-01-01T00:00:00Z" },
    };

    // When the token was issued an hour before, written with an offset
    // Then the instant is before the limit, whatever zone it is written in
    assertTrue(
      allowed(condition, { "aws:TokenIssueTime": "2027-01-01T00:00:00+01:00" }),
    );
    assertFalse(
      allowed(condition, { "aws:TokenIssueTime": "2027-01-01T00:00:00Z" }),
    );
  });

  it("compares epoch seconds with an ISO 8601 date", () => {
    // Given a read allowed at or after the start of 2027
    const condition = {
      DateGreaterThanEquals: { "aws:TokenIssueTime": "2027-01-01T00:00:00Z" },
    };

    // When the token was issued at that instant, written as epoch seconds,
    // and a second before it
    // Then the first matches and the second does not
    assertTrue(allowed(condition, { "aws:TokenIssueTime": "1798761600" }));
    assertFalse(allowed(condition, { "aws:TokenIssueTime": 1_798_761_599 }));
  });

  it("matches DateEquals on the same instant only", () => {
    // Given a read allowed at one instant
    const condition = { DateEquals: { "aws:TokenIssueTime": "2027-01-01" } };

    // When the token was issued at midnight that day, and a minute after
    // Then a date with no time is read as midnight UTC
    assertTrue(
      allowed(condition, { "aws:TokenIssueTime": "2027-01-01T00:00:00Z" }),
    );
    assertFalse(
      allowed(condition, { "aws:TokenIssueTime": "2027-01-01T00:01:00Z" }),
    );
  });

  it("refuses a value that is no date", () => {
    // Given a read withheld on one date
    const condition = { DateNotEquals: { "aws:TokenIssueTime": "2027-01-01" } };

    // When the issue time is written as a word
    // Then the condition fails rather than reading the word as another date
    assertFalse(allowed(condition, { "aws:TokenIssueTime": "tomorrow" }));
  });

  it("refuses a date that is shaped right and does not exist", () => {
    // Given a read allowed before the start of 2027
    const condition = {
      DateLessThan: { "aws:TokenIssueTime": "2027-01-01T00:00:00Z" },
    };

    // When the issue time names a thirteenth month
    // Then the condition fails rather than reading it as some other date
    assertFalse(allowed(condition, { "aws:TokenIssueTime": "2026-13-01" }));
  });

  it("reads a year and month as midnight UTC on the first", () => {
    // Given a read allowed from February 2026
    const condition = {
      DateGreaterThanEquals: { "aws:TokenIssueTime": "2026-02" },
    };

    // When the token was issued on the first of February, and a second before
    // Then the month names the first instant of it
    assertTrue(
      allowed(condition, { "aws:TokenIssueTime": "2026-02-01T00:00:00Z" }),
    );
    assertFalse(
      allowed(condition, { "aws:TokenIssueTime": "2026-01-31T23:59:59Z" }),
    );
  });

  it.each(["2026-02-30", "2026-02-29T00:00:00Z", "2026-01-01T24:00:00Z"])(
    "refuses %s, a date that does not exist",
    (issued) => {
      // Given a read withheld on New Year's Day
      const condition = {
        DateNotEquals: { "aws:TokenIssueTime": "2026-01-01" },
      };

      // When the issue time names a day or hour the calendar lacks
      // Then the condition fails rather than rolling it into the next one
      assertFalse(allowed(condition, { "aws:TokenIssueTime": issued }));
    },
  );

  it.each([
    "2026-1-01",
    "2026-01T10:00Z",
    "2026-01-01T10Z",
    "2026-01-01T10:00.5Z",
    "2026-01-01T10:00:00.5.5Z",
    "2026-01-01T10:00:00TZ",
  ])("refuses %s, which is no W3C date", (issued) => {
    // Given a read withheld on New Year's Day
    const condition = { DateNotEquals: { "aws:TokenIssueTime": "2026-01-01" } };

    // When the issue time is written in a shape W3C does not define
    // Then the condition fails
    assertFalse(allowed(condition, { "aws:TokenIssueTime": issued }));
  });

  it("reads a leap day, fractions of a second and a zone offset", () => {
    // Given a read allowed before 2028-02-29T12:00:00.500Z
    const condition = {
      DateLessThan: { "aws:TokenIssueTime": "2028-02-29T12:00:00.500Z" },
    };

    // When the token was issued a quarter second before it, written five
    // hours behind UTC, and then a quarter second after it
    // Then both are read as the instants they name
    assertTrue(
      allowed(condition, {
        "aws:TokenIssueTime": "2028-02-29T07:00:00.250-05:00",
      }),
    );
    assertFalse(
      allowed(condition, { "aws:TokenIssueTime": "2028-02-29T12:00:00.750Z" }),
    );
  });

  it("reads a negative epoch as seconds before 1970", () => {
    // Given a read allowed before the epoch
    const condition = { DateLessThan: { "aws:TokenIssueTime": "1970-01-01" } };

    // When the token was issued a minute before it
    // Then the negative number is read as epoch seconds
    assertTrue(allowed(condition, { "aws:TokenIssueTime": "-60" }));
  });

  it("derives the request time from the simulated clock over a supplied one", async () => {
    // Given a read allowed until the start of 2027, in a simulation an hour
    // before it
    const simAws = new SimAws();
    await simAws.clock().setTo(new Date("2026-12-31T23:00:00Z"));

    // When the request supplies a later time of its own
    const decision = simAws.iam().authorize({
      action: "s3:GetObject",
      resource: reportObject,
      caller: { kind: "anonymous" },
      conditionContext: { "aws:CurrentTime": "2027-06-01T00:00:00Z" },
      resourcePolicies: [
        simIamAuthZResourcePolicySourceFactory.make({
          document: {
            Statement: {
              Effect: "Allow",
              Principal: "*",
              Action: "s3:GetObject",
              Resource: reportObject,
              Condition: {
                DateLessThan: { "aws:CurrentTime": "2027-01-01T00:00:00Z" },
                NumericLessThan: { "aws:EpochTime": "1798761600" },
              },
            },
          },
        }),
      ],
    });

    // Then IAM reads the simulated clock, as it reads the real one on AWS
    assertTrue(decision.isAllowed);
  });

  it("applies a policy dated in the future once the simulated clock reaches it", async () => {
    // Given an organization freezing Bucket creation from 2027, an hour away
    const { simAws, accountId } = await frozenSimulation();
    const iam = simAws.account(accountId).iam();
    const request = {
      action: "s3:CreateBucket",
      resource: `arn:aws:s3:::${accountId}-reports`,
    };

    // When the Account root asks before the freeze and again after it
    const before = iam.authorize(request);
    await simAws.clock().advanceBy({ hours: 2 });
    const after = iam.authorize(request);

    // Then the guardrail reads the simulated time of each request
    assertTrue(before.isAllowed);
    assertTrue(after.isExplicitDeny);
  });
});
