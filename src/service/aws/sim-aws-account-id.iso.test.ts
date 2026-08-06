import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";

import { DEFAULT_SIM_AWS_ACCOUNT_ID } from "./sim-aws-account.js";
import {
  isSimAwsAccountId,
  makeSimAwsAccountId,
  simAwsAccountId,
  SimInvalidAwsAccountId,
} from "./sim-aws-account-id.js";
import { SimAws } from "./sim-aws.js";

describe("simAwsAccountId", () => {
  it("names a twelve digit Account ID", () => {
    // Given a twelve digit AWS Account ID written as a plain string
    const written = "111111111111";

    // When it is named
    // Then it comes back as the same ID, now typed as one
    expect(simAwsAccountId(written)).toBe(written);
  });

  it("keeps leading zeroes", () => {
    // Given an AWS Account ID that starts with a zero
    // When it is named
    // Then the zero is still there: an Account ID is digits, not a number
    expect(simAwsAccountId("000123456789")).toBe("000123456789");
  });

  it("refuses a value that is not twelve digits", () => {
    // Given values that no AWS Account ID looks like
    // When they are named
    // Then each is refused, with the value in the message
    expect(() => simAwsAccountId("12345")).toThrow(SimInvalidAwsAccountId);
    expect(() => simAwsAccountId("12345")).toThrow(/"12345"/);
    expect(() => simAwsAccountId("1111111111111")).toThrow(
      SimInvalidAwsAccountId,
    );
    expect(() => simAwsAccountId("not-an-account")).toThrow(/"not-an-account"/);
    expect(() => simAwsAccountId("11111111111 ")).toThrow(
      SimInvalidAwsAccountId,
    );
  });

  it("refuses a value that is not a string at all", () => {
    // Given a caller without types passing something else entirely
    const notAnId = 111_111_111_111 as unknown as string;

    // When it is named
    // Then it is refused rather than branded
    expect(() => simAwsAccountId(notAnId)).toThrow(SimInvalidAwsAccountId);
  });

  it("names an Account a simulated AWS then accepts", async () => {
    // Given a named Account ID
    const accountId = simAwsAccountId("222222222222");

    // When it is used to scope a simulated service
    const simAws = new SimAws();
    await simAws
      .account(accountId)
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "id-bucket" }));

    // Then the resources are in that Account
    expect(
      simAws.account(accountId).s3().getSimBucketByName("id-bucket"),
    ).toBeDefined();
  });
});

describe("isSimAwsAccountId", () => {
  it("narrows a string that is an Account ID", () => {
    // Given a value that could be anything
    const value: unknown = "333333333333";

    // When it is checked
    // Then it is an Account ID, and narrowed to one
    expect(isSimAwsAccountId(value)).toBe(true);
  });

  it("rejects anything that is not an Account ID", () => {
    // Given values that are not AWS Account IDs
    // When they are checked
    // Then none of them narrows
    expect(isSimAwsAccountId("nope")).toBe(false);
    expect(isSimAwsAccountId(333_333_333_333)).toBe(false);
    expect(isSimAwsAccountId(undefined)).toBe(false);
  });
});

describe("makeSimAwsAccountId", () => {
  it("generates an arbitrary Account ID", () => {
    // Given a test that wants an Account ID but does not care which
    const accountId = makeSimAwsAccountId();

    // When it is checked
    // Then it is a usable AWS Account ID
    expect(isSimAwsAccountId(accountId)).toBe(true);
  });
});

describe("DEFAULT_SIM_AWS_ACCOUNT_ID", () => {
  it("is an AWS Account ID", () => {
    // Given the Account ID a simulated AWS uses when none is given
    // When it is checked
    // Then it is a usable AWS Account ID
    expect(isSimAwsAccountId(DEFAULT_SIM_AWS_ACCOUNT_ID)).toBe(true);
  });
});
