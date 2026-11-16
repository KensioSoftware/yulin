import {
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { SimEcsAccessDeniedException } from "../../error/sim-ecs.error.js";

const ordersTag = [{ key: "team", value: "orders" }];

describe("sim ECS tagging on create", () => {
  it("needs ecs:TagResource to create a cluster or task definition with tags", async () => {
    // Given a caller allowed to create clusters and register task definitions
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { actions: ["ecs:CreateCluster", "ecs:RegisterTaskDefinition"] },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;
    const containerDefinitions = [{ name: "app", image: "nginx" }];

    // When it creates an untagged cluster, then a tagged cluster and a tagged
    // task definition
    const plain = await simAws
      .ecs()
      .createCluster({ input: { clusterName: "plain" } }, { caller });
    const cluster = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .createCluster(
          { input: { clusterName: "tagged", tags: ordersTag } },
          { caller },
        ),
    );
    const taskDefinition = await assertThrowsErrorAsync(async () =>
      simAws.ecs().registerTaskDefinition(
        {
          input: { family: "worker", containerDefinitions, tags: ordersTag },
        },
        { caller },
      ),
    );

    // Then only the tagged ones are refused
    assertNonNullable(plain.cluster);
    assertInstanceOf(cluster, SimEcsAccessDeniedException);
    assertInstanceOf(taskDefinition, SimEcsAccessDeniedException);
  });

  it("names the create action as ecs:CreateAction, and the tags as request tags", async () => {
    // Given a caller allowed to create clusters, and to tag them only while
    // creating them for its own team
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "Creator", actions: ["ecs:CreateCluster"] },
      simAws,
    );
    await simAws.iam().putRolePolicy({
      input: {
        RoleName: "Creator",
        PolicyName: "TagOnCreate",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "ecs:TagResource",
            Resource: "*",
            Condition: {
              StringEquals: {
                "ecs:CreateAction": "CreateCluster",
                "aws:RequestTag/team": "orders",
              },
            },
          },
        }),
      },
    });
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it creates a cluster for its own team and one for another
    const orders = await simAws
      .ecs()
      .createCluster(
        { input: { clusterName: "orders", tags: ordersTag } },
        { caller },
      );
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().createCluster(
        {
          input: {
            clusterName: "billing",
            tags: [{ key: "team", value: "billing" }],
          },
        },
        { caller },
      ),
    );

    // Then only its own team's cluster is made
    assertNonNullable(orders.cluster);
    assertInstanceOf(error, SimEcsAccessDeniedException);
  });
});
