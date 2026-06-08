import { describe, it } from "vitest";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { SimAws } from "./sim-aws.js";
import { installSimS3 } from "../s3/index.js";
import { installSimDynamoDb } from "../dynamodb/index.js";
import { SimS3ServiceController } from "../s3/serve/sim-s3-controller.js";
import type { SimS3Services } from "../s3/install/install-sim-s3.js";

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
    installSimS3(simAws);

    assertIdentical(simAws.service("s3"), simAws.account().service("s3"));
    assertIdentical(simAws.service("s3"), simAws.region().service("s3"));
    assertIdentical(
      simAws.service("s3"),
      simAws.account().region().service("s3"),
    );
    assertIdentical(
      simAws.service("s3"),
      simAws.region().account().service("s3"),
    );
  });

  it("returns same default DynamoDB from all default scope paths", () => {
    const simAws = new SimAws();
    installSimDynamoDb(simAws);

    assertIdentical(
      simAws.service("dynamoDb"),
      simAws.account().service("dynamoDb"),
    );
    assertIdentical(
      simAws.service("dynamoDb"),
      simAws.region().service("dynamoDb"),
    );
    assertIdentical(
      simAws.service("dynamoDb"),
      simAws.account().region().service("dynamoDb"),
    );
    assertIdentical(
      simAws.service("dynamoDb"),
      simAws.region().account().service("dynamoDb"),
    );
  });

  it("throws when a service is not installed", () => {
    const simAws = new SimAws();

    const error = assertThrowsError(() => {
      simAws.service("s3" as never);
    });

    assertStringIncludes(error.message, "Sim AWS service is not installed: s3");
  });

  it("throws on trying to install a duplicate service controller", () => {
    const simAws = new SimAws();

    simAws.installServiceController(
      "s3",
      (sa) => new SimS3ServiceController(sa as SimAws<SimS3Services>),
    );

    const error = assertThrowsError(() => {
      simAws.installServiceController(
        "s3",
        (sa) => new SimS3ServiceController(sa as SimAws<SimS3Services>),
      );
    });

    assertStringIncludes(
      error.message,
      "Sim AWS service controller is already installed: s3",
    );
  });
});
