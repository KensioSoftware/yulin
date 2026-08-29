import {
  assertFalse,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";

const repositoryTemplate = {
  Resources: {
    OrdersRepository: {
      Type: "AWS::ECR::Repository",
      Properties: { RepositoryName: "orders" },
    },
  },
};

/**
 * Deploy a Stack holding one repository, as the caller it is given.
 */
async function deployAsCaller(
  simAws: SimAws,
  caller: SimAwsCaller,
): Promise<SimCfnDeployedStack> {
  return await simAws.cloudFormation().deployTemplate({
    stackName: "platform-stack",
    template: repositoryTemplate,
    caller,
  });
}

/**
 * A Role allowed the actions it is given, as a caller a deployment can name.
 */
async function roleAllowing(
  simAws: SimAws,
  roleName: string,
  actions: readonly string[],
): Promise<SimAwsCaller> {
  const role = await simIamRoleWithPolicyFactory.make(
    { roleName, actions },
    simAws,
  );

  return { kind: "arn", arn: role.Arn };
}

describe("the principal an AWS::ECR::Repository Resource is created as", () => {
  it("fails the Resource under a caller that may not create repositories", async () => {
    // Given a Role that may read images and not make a repository to hold
    // them.
    const simAws = new SimAws();
    const puller = await roleAllowing(simAws, "Puller", ["ecr:BatchGetImage"]);

    // When a Stack declaring a repository is deployed as it.
    const error = await assertThrowsErrorAsync(
      async () => await deployAsCaller(simAws, puller),
    );

    // Then the deploy is refused by name, and no repository was made behind
    // the refusal.
    assertStringIncludes(error.message, "ecr:CreateRepository");
    assertStringIncludes(error.message, "role/Puller");
    assertFalse(simAws.ecr().hasRepository("orders"));
    assertIdentical(
      simAws
        .cloudFormation()
        .getStackByName("platform-stack")
        ?.getResource("OrdersRepository")?.status,
      "CREATE_FAILED",
    );
  });

  it("creates the repository under a caller allowed the creation", async () => {
    // Given a Role allowed to make repositories.
    const simAws = new SimAws();
    const deployer = await roleAllowing(simAws, "Deployer", [
      "ecr:CreateRepository",
    ]);

    // When it deploys the Stack.
    await deployAsCaller(simAws, deployer);

    // Then simulated ECR holds the repository the template declared.
    assertTrue(simAws.ecr().hasRepository("orders"));
  });

  it("tears the repository down as the principal the Stack was deployed as", async () => {
    // Given a Stack deployed by a Role that may make a repository and not
    // remove one.
    const simAws = new SimAws();
    const maker = await roleAllowing(simAws, "Maker", ["ecr:CreateRepository"]);
    const stack = await deployAsCaller(simAws, maker);

    // When the Stack is torn down.
    const error = await assertThrowsErrorAsync(async () => {
      await stack.teardown();
    });

    // Then the deletion was refused by name, and the repository is where it
    // was.
    assertStringIncludes(error.message, "ecr:DeleteRepository");
    assertTrue(simAws.ecr().hasRepository("orders"));
  });
});
