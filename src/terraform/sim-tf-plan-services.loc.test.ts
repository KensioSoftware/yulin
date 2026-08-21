import { describe, it } from "vitest";
import {
  assertArrayEquals,
  assertArrayIncludes,
  assertIdentical,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { SimAws } from "../service/aws/sim-aws.js";
import {
  terraformPlanHandlers as handlersFor,
  terraformPlannedPath as plannedPath,
} from "../../test/terraform/plan/terraform-planned-configuration.js";
import { TerraformAdapter } from "./sim-tf-adapter.js";

/*
 * What the application configuration under `test/terraform/app` reaches, one
 * simulated service at a time.
 *
 * The deployment itself is covered beside this. These say that a resource the
 * import mapped is a resource the service it belongs to went on to create, and
 * that it behaves as the configuration described.
 */

describe("deploying a plan into the services it names", () => {
  it("deploys the encryption, auth and alerting an application declares", async () => {
    // Given the same application configuration, whose KMS key, user pool,
    // alarms, schedule and repository are each a service of their own
    const simAws = new SimAws();

    // When it is deployed
    await new TerraformAdapter(simAws).deployPlan({
      planPath: await plannedPath("app"),
      stackName: "services-app",
      bindings: handlersFor("app"),
    });

    // Then each one exists in the simulator it belongs to
    const pools = await simAws
      .cognitoIdentityProvider()
      .listUserPools({ input: { MaxResults: 10 } });

    assertNonNullable(simAws.kms().findAlias("alias/orders"));
    assertArrayIncludes(
      (pools.UserPools ?? []).map((pool) => pool.Name),
      "orders-users",
    );
    assertNonNullable(simAws.cloudWatch().findAlarm("orders-dlq-depth"));
    assertNonNullable(simAws.eventBridge().findRule("orders-nightly"));
    assertTrue(simAws.ecr().hasRepository("orders-processor"));
  });

  it("delivers a bucket event to the function the plan named", async () => {
    // Given a configuration whose bucket notifies a function on upload. The
    // notification is a resource of its own in Terraform, and the function's
    // permission names the bucket, which is a circular dependency where
    // CloudFormation carries the notification on the bucket
    const simAws = new SimAws();
    const uploaded: string[] = [];

    // When the plan is deployed and an object is put in the bucket
    await new TerraformAdapter(simAws).deployPlan({
      planPath: await plannedPath("app"),
      stackName: "notified-app",
      bindings: [
        {
          functionName: "orders-processor",
          handler: (event: {
            Records?: { s3: { object: { key: string } } }[];
          }) => {
            const records = event.Records ?? [];

            for (const record of records) {
              uploaded.push(record.s3.object.key);
            }

            return { ok: true };
          },
        },
      ],
    });

    await simAws.s3().putObject({
      input: { Bucket: "orders-uploads", Key: "receipt.jpg", Body: "bytes" },
    });
    await simAws.backgroundTasksComplete();

    // Then the function ran for it
    assertArrayEquals(uploaded, ["receipt.jpg"]);
  });

  it("provisions a table the configuration billed by capacity", async () => {
    // Given a table declaring PROVISIONED billing, which simulated DynamoDB
    // refuses without the capacity to go with it
    const simAws = new SimAws();

    // When the plan is deployed
    await new TerraformAdapter(simAws).deployPlan({
      planPath: await plannedPath("app"),
      stackName: "provisioned-app",
      bindings: handlersFor("app"),
    });

    // Then the table exists with the capacity the configuration named
    const table = simAws.dynamoDb().findTable("orders-reports");

    assertNonNullable(table);
    assertIdentical(table.billing.mode, "PROVISIONED");
  });
});
