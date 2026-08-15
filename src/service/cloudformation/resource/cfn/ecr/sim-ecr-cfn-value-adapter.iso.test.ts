import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import { ecrValueAdapter } from "./sim-ecr-cfn-value-adapter.js";

describe("ECR CloudFormation value adapter", () => {
  it("refuses an attribute an ECR repository does not answer", async () => {
    // Given a template reading an attribute AWS::ECR::Repository has no
    // value for here.
    const simAws = new SimAws();

    // When it is deployed.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "platform-stack",
        template: {
          Resources: {
            OrdersRepository: {
              Type: "AWS::ECR::Repository",
              Properties: { RepositoryName: "orders" },
            },
            OrdersQueue: {
              Type: "AWS::SQS::Queue",
              Properties: {
                QueueName: {
                  "Fn::GetAtt": ["OrdersRepository", "RegistryId"],
                },
              },
            },
          },
        },
      }),
    );

    // Then the attribute is named in the refusal.
    assertStringIncludes(
      error.message,
      "Unsupported AWS::ECR::Repository attribute RegistryId",
    );

    await simAws.backgroundTasksComplete();
  });

  it("claims nothing but an ECR repository", () => {
    // Given a Resource of another service, and an ECR Resource type with no
    // simulated repository behind it.
    // When the ECR adapter is offered each of them.
    // Then it claims neither, so they fall through to the adapter that owns
    // them, or to the default one.
    assertUndefined(
      ecrValueAdapter({
        logicalId: "OrdersQueue",
        type: "AWS::SQS::Queue",
        simResource: undefined,
      }),
    );
    assertUndefined(
      ecrValueAdapter({
        logicalId: "OrdersRepository",
        type: "AWS::ECR::Repository",
        simResource: undefined,
      }),
    );
  });

  it("answers Ref with the repository name", () => {
    // Given the adapter over a simulated repository.
    const repository = new SimAws().ecr().repository("orders");
    const adapter = ecrValueAdapter({
      logicalId: "OrdersRepository",
      type: "AWS::ECR::Repository",
      simResource: repository,
    });

    // Then a Ref reads as the name, as it does on real CloudFormation.
    assertIdentical(adapter?.refValue(), "orders");
  });
});
