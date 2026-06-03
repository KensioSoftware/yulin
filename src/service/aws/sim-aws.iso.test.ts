import { describe, it } from "vitest";
import { assertIdentical } from "@kensio/smartass";
import { SimAws } from "./sim-aws.js";

describe("SimAws", () => {
  it("returns same Account for same Account ID", () => {
    const simAws = new SimAws();

    assertIdentical(
      simAws.account("111111111111"),
      simAws.account("111111111111"),
    );
  });

  it("returns different Accounts for different Account IDs", () => {
    const simAws = new SimAws();

    const account1 = simAws.account("111111111111");
    const account2 = simAws.account("222222222222");

    assertIdentical(
      account1.region().region.regionName,
      account2.region().region.regionName,
    );
  });

  it("returns same Region for same Region name", () => {
    const simAws = new SimAws();

    assertIdentical(simAws.region("eu-west-1"), simAws.region("eu-west-1"));
  });

  it("returns different Regions for different Region names", () => {
    const simAws = new SimAws();

    const euWest1 = simAws.region("eu-west-1");
    const apSoutheast2 = simAws.region("ap-southeast-2");

    assertIdentical(
      euWest1.account().account.accountId,
      apSoutheast2.account().account.accountId,
    );
  });

  it("returns same Account Region scope regardless of selection order", () => {
    const simAws = new SimAws();

    assertIdentical(
      simAws.account("111111111111").region("eu-west-1"),
      simAws.region("eu-west-1").account("111111111111"),
    );
  });

  it("returns same default S3 from all default scope paths", () => {
    const simAws = new SimAws();

    assertIdentical(simAws.s3(), simAws.account().s3());
    assertIdentical(simAws.s3(), simAws.region().s3());
    assertIdentical(simAws.s3(), simAws.account().region().s3());
    assertIdentical(simAws.s3(), simAws.region().account().s3());
  });

  it("returns same default DynamoDB from all default scope paths", () => {
    const simAws = new SimAws();

    assertIdentical(simAws.dynamoDb(), simAws.account().dynamoDb());
    assertIdentical(simAws.dynamoDb(), simAws.region().dynamoDb());
    assertIdentical(simAws.dynamoDb(), simAws.account().region().dynamoDb());
    assertIdentical(simAws.dynamoDb(), simAws.region().account().dynamoDb());
  });
});
