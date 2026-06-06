import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { assertInstanceOf, assertThrowsError } from "@kensio/smartass";
import { installSimDynamoDb, SimDynamoDb } from "./install-sim-dynamodb.js";

describe("Sim DynamoDB installer", () => {
  it("installs sim DynamoDB into top-level sim AWS", () => {
    const simAws = new SimAws();

    assertThrowsError(() => {
      simAws.service("dynamoDb" as never);
    });

    installSimDynamoDb(simAws);

    const simDynamoDb = simAws.service("dynamoDb");

    assertInstanceOf(simDynamoDb, SimDynamoDb);
  });

  it("installs sim DynamoDB into sim AWS Region", () => {
    const simAws = new SimAws();

    assertThrowsError(() => {
      simAws.region("eu-west-2").service("dynamoDb" as never);
    });

    installSimDynamoDb(simAws);

    const simDynamoDb = simAws.region("eu-west-2").service("dynamoDb");

    assertInstanceOf(simDynamoDb, SimDynamoDb);
  });

  it("installs sim DynamoDB into sim AWS Account", () => {
    const simAws = new SimAws();

    assertThrowsError(() => {
      simAws.account("666666666666").service("dynamoDb" as never);
    });

    installSimDynamoDb(simAws);

    const simDynamoDb = simAws.account("666666666666").service("dynamoDb");

    assertInstanceOf(simDynamoDb, SimDynamoDb);
  });

  it("installs sim DynamoDB into sim AWS Account Region scope", () => {
    const simAws = new SimAws();

    assertThrowsError(() => {
      simAws
        .account("666666666666")
        .region("eu-west-2")
        .service("dynamoDb" as never);
    });

    installSimDynamoDb(simAws);

    const simDynamoDb = simAws
      .account("666666666666")
      .region("eu-west-2")
      .service("dynamoDb");

    assertInstanceOf(simDynamoDb, SimDynamoDb);
  });
});
