import { describe, it } from "vitest";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertStringIncludes,
} from "@kensio/smartass";
import {
  terraformPlanFactory,
  terraformPlanResourceFactory,
  type TerraformPlanFixture,
} from "../../test/terraform/plan/terraform-plan.factory.js";
import { TemporaryDirectory } from "../util/filesystem/temporary-directory.js";
import { SimAws } from "../service/aws/sim-aws.js";
import { TerraformAdapter } from "./sim-tf-adapter.js";
import { jsonStringify } from "../util/type-guard/json.js";

/** Write a plan fixture out as the JSON `terraform show -json` writes. */
async function planFile(
  fixture: Partial<TerraformPlanFixture>,
  fileName = "orders.tfplan.json",
): Promise<string> {
  const directory = new TemporaryDirectory();

  await directory.writeFile(
    fileName,
    jsonStringify(terraformPlanFactory.make(fixture)),
  );

  return directory.join(fileName);
}

describe("deploying a Terraform plan into simulated AWS", () => {
  it("creates the resources of a plan file", async () => {
    // Given a plan file declaring a bucket and a queue
    const planPath = await planFile({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_s3_bucket",
          name: "uploads",
          values: { bucket: "orders-uploads" },
        }),
        terraformPlanResourceFactory.make({
          values: { name: "orders-processing" },
        }),
      ],
    });

    // When the plan is deployed
    const simAws = new SimAws();
    const { stack } = await new TerraformAdapter(simAws).deployPlan(planPath);

    // Then simulated AWS holds what the plan declared
    assertNonNullable(simAws.s3().getSimBucketByName("orders-uploads"));
    assertNonNullable(simAws.sqs().findQueue("orders-processing"));
    assertIdentical(stack.status, "CREATE_COMPLETE");
  });

  it("names the Stack after the plan file", async () => {
    // Given a plan file whose name says what it plans
    const planPath = await planFile(
      { resources: [terraformPlanResourceFactory.make({})] },
      "orders.tfplan.json",
    );

    // When it is deployed without a Stack name
    const { stack } = await new TerraformAdapter(new SimAws()).deployPlan(
      planPath,
    );

    // Then the Stack takes the file's name, the way a template file does
    assertIdentical(stack.stackName, "orders");
  });

  it("takes the Stack name and the bindings a deployment gives it", async () => {
    // Given a plan file declaring a function, whose code a plan cannot carry
    const planPath = await planFile({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_iam_role",
          name: "processor",
          values: {
            name: "orders-processor",
            assume_role_policy: JSON.stringify({
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Principal: { Service: "lambda.amazonaws.com" },
                  Action: "sts:AssumeRole",
                },
              ],
            }),
          },
        }),
        terraformPlanResourceFactory.make({
          type: "aws_lambda_function",
          name: "processor",
          values: {
            function_name: "orders-processor",
            handler: "index.handler",
            runtime: "nodejs20.x",
          },
          unknown: { role: true },
          references: {
            role: ["aws_iam_role.processor.arn", "aws_iam_role.processor"],
          },
        }),
      ],
    });

    // When it is deployed with a handler bound to the function name the plan
    // declares
    const simAws = new SimAws();
    const { stack } = await new TerraformAdapter(simAws).deployPlan({
      planPath,
      stackName: "orders-stack",
      bindings: [
        {
          functionName: "orders-processor",
          handler: (): { ok: boolean } => ({ ok: true }),
        },
      ],
    });

    // Then the Stack is the one asked for, and the function runs what was
    // bound to it
    assertIdentical(stack.stackName, "orders-stack");
    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "orders-processor" }));
    assertStringIncludes(
      Buffer.from(invoked.Payload ?? new Uint8Array()).toString("utf8"),
      '"ok":true',
    );
  });

  it("reports what of the plan the Stack created and what it stepped over", async () => {
    // Given a plan file holding a queue, a type this import has no mapping
    // for, and a resource from another provider
    const planPath = await planFile({
      resources: [
        terraformPlanResourceFactory.make({
          values: { name: "orders-processing" },
        }),
        terraformPlanResourceFactory.make({
          type: "aws_route53_zone",
          name: "public",
        }),
        terraformPlanResourceFactory.make({
          type: "random_password",
          name: "database",
          provider: "hashicorp/random",
        }),
      ],
    });

    // When it is deployed
    const { stack, report } = await new TerraformAdapter(
      new SimAws(),
    ).deployPlan(planPath);

    // Then the deployment went ahead, and the report says which resources of
    // the plan were created and which were stepped over, by Terraform type
    assertIdentical(stack.status, "CREATE_COMPLETE");
    assertArrayEquals(
      report.mapped.map((entry) => entry.type),
      ["aws_sqs_queue"],
    );
    assertArrayEquals(
      report.skipped.map((entry) => entry.type),
      ["aws_route53_zone", "random_password"],
    );
  });

  it("says where it looked when there is no plan file there", async () => {
    // Given a path with no file at it, which is what an unwritten plan looks
    // like on a fresh checkout
    const simAws = new SimAws();

    // When it is deployed
    const error = await assertThrowsErrorAsync(async () => {
      await new TerraformAdapter(simAws).deployPlan("missing.tfplan.json");
    });

    // Then the path it looked at is named, resolved
    assertStringIncludes(error.message, "No Terraform plan JSON file at");
    assertStringIncludes(error.message, "missing.tfplan.json");
  });

  it("reports a path that is not a file as the filesystem does", async () => {
    // Given the directory the plan was written into rather than the plan
    const directory = new TemporaryDirectory();
    await directory.resolvePath();

    // When it is deployed
    const error = await assertThrowsErrorAsync(async () => {
      await new TerraformAdapter(new SimAws()).deployPlan(directory.path());
    });

    // Then the filesystem's own reason comes through, since a path that is
    // there and unreadable is a different mistake from one that is not there
    assertStringIncludes(error.message, "EISDIR");
  });

  it("says what wrote the JSON when the file is not the JSON form", async () => {
    // Given the saved plan file itself rather than the JSON of it, which is
    // Terraform's own binary format under a name that looks right
    const directory = new TemporaryDirectory();
    await directory.writeFile("orders.tfplan.json", "not json at all");

    // When it is deployed
    const error = await assertThrowsErrorAsync(async () => {
      await new TerraformAdapter(new SimAws()).deployPlan(
        directory.join("orders.tfplan.json"),
      );
    });

    // Then the message is the command that writes what this reads
    assertStringIncludes(error.message, "terraform show -json");
  });

  it("refuses JSON that is not a document at all", async () => {
    // Given a file holding valid JSON that is not an object
    const directory = new TemporaryDirectory();
    await directory.writeFile("orders.tfplan.json", "[]");

    // When it is deployed
    const error = await assertThrowsErrorAsync(async () => {
      await new TerraformAdapter(new SimAws()).deployPlan(
        directory.join("orders.tfplan.json"),
      );
    });

    // Then it is refused the same way, rather than read as a plan holding
    // nothing
    assertStringIncludes(error.message, "is not Terraform plan JSON");
  });
});
