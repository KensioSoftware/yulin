import {
  CreateEventBusCommand,
  ListTagsForResourceCommand,
  PutEventsCommand,
  PutRuleCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-eventbridge";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import {
  SimEventBridgeAccessDeniedException,
  SimEventBridgeResourceNotFoundException,
  SimEventBridgeValidationException,
} from "../../error/sim-event-bridge.error.js";

const orderPattern = JSON.stringify({ source: ["orders.service"] });

/**
 * Create a bus tagged for the team given, and answer with its ARN.
 */
async function teamBus(simAws: SimAws, team: string): Promise<string> {
  const created = await simAws.eventBridge().createEventBus(
    new CreateEventBusCommand({
      Name: team,
      Tags: [{ Key: "team", Value: team }],
    }),
  );

  return created.EventBusArn ?? "";
}

/**
 * The tags a rule or bus holds, as `Key=Value` strings in the order listed.
 */
async function tagsOf(simAws: SimAws, ResourceARN: string): Promise<string[]> {
  const listed = await simAws
    .eventBridge()
    .listTagsForResource(new ListTagsForResourceCommand({ ResourceARN }));

  return listed.Tags.map((tag) => `${tag.Key}=${tag.Value}`);
}

describe("sim EventBridge tags", () => {
  it("holds the tags a rule is created with, and changes them on request", async () => {
    // Given a rule created with two tags
    const simAws = new SimAws();
    const { RuleArn: ResourceARN = "" } = await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "orders",
        EventPattern: orderPattern,
        Tags: [
          { Key: "team", Value: "orders" },
          { Key: "stage", Value: "test" },
        ],
      }),
    );

    // When one is replaced, one added and one removed
    await simAws.eventBridge().tagResource(
      new TagResourceCommand({
        ResourceARN,
        Tags: [
          { Key: "stage", Value: "prod" },
          { Key: "cost", Value: "42" },
        ],
      }),
    );
    await simAws
      .eventBridge()
      .untagResource(
        new UntagResourceCommand({ ResourceARN, TagKeys: ["team"] }),
      );

    // Then the rule holds the result
    assertArrayEquals(await tagsOf(simAws, ResourceARN), [
      "stage=prod",
      "cost=42",
    ]);
  });

  it("keeps a rule's tags when PutRule replaces it, ignoring those it carries", async () => {
    // Given a tagged rule
    const simAws = new SimAws();
    const { RuleArn = "" } = await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "orders",
        EventPattern: orderPattern,
        Tags: [{ Key: "team", Value: "orders" }],
      }),
    );

    // When PutRule replaces it carrying other tags
    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "orders",
        EventPattern: orderPattern,
        Description: "replaced",
        Tags: [{ Key: "team", Value: "billing" }],
      }),
    );

    // Then the rule is replaced and keeps the tags it held
    assertIdentical(
      simAws.eventBridge().findRule("orders")?.description,
      "replaced",
    );
    assertArrayEquals(await tagsOf(simAws, RuleArn), ["team=orders"]);
  });

  it("refuses a request that would leave a bus over 50 tags", async () => {
    // Given a bus holding one tag
    const simAws = new SimAws();
    const ResourceARN = await teamBus(simAws, "orders");
    const Tags = Array.from({ length: 50 }, (_, index) => ({
      Key: `key-${String(index)}`,
      Value: "value",
    }));

    // When fifty more are added
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .eventBridge()
        .tagResource(new TagResourceCommand({ ResourceARN, Tags })),
    );

    // Then the request is refused whole
    assertInstanceOf(error, SimEventBridgeValidationException);
    assertArrayEquals(await tagsOf(simAws, ResourceARN), ["team=orders"]);
  });

  it("answers ResourceNotFound for a resource that is not there", async () => {
    // Given a simulation with no custom buses
    const simAws = new SimAws();

    // When a bus ARN naming nothing is tagged
    const error = await assertThrowsErrorAsync(async () =>
      simAws.eventBridge().tagResource(
        new TagResourceCommand({
          ResourceARN: `arn:aws:events:${simAws.defaultRegionName}:${simAws.defaultAccountId}:event-bus/missing`,
          Tags: [{ Key: "team", Value: "orders" }],
        }),
      ),
    );

    // Then it is refused
    assertInstanceOf(error, SimEventBridgeResourceNotFoundException);
  });

  it("needs events:TagResource to create a rule or bus with tags", async () => {
    // Given a caller allowed to create rules and buses and nothing else
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { actions: ["events:PutRule", "events:CreateEventBus"] },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;
    const Tags = [{ Key: "team", Value: "orders" }];

    // When it creates an untagged rule, then a tagged rule and a tagged bus
    await simAws
      .eventBridge()
      .putRule(
        new PutRuleCommand({ Name: "plain", EventPattern: orderPattern }),
        { caller },
      );
    const rule = await assertThrowsErrorAsync(async () =>
      simAws.eventBridge().putRule(
        new PutRuleCommand({
          Name: "tagged",
          EventPattern: orderPattern,
          Tags,
        }),
        { caller },
      ),
    );
    const bus = await assertThrowsErrorAsync(async () =>
      simAws
        .eventBridge()
        .createEventBus(new CreateEventBusCommand({ Name: "tagged", Tags }), {
          caller,
        }),
    );

    // Then only the tagged ones are refused
    assertInstanceOf(rule, SimEventBridgeAccessDeniedException);
    assertInstanceOf(bus, SimEventBridgeAccessDeniedException);
    assertUndefined(simAws.eventBridge().findRule("tagged"));
    assertUndefined(simAws.eventBridge().findEventBus("tagged"));
  });

  it("lets a policy decide PutEvents on the bus's tags", async () => {
    // Given two buses tagged for different teams, and a caller allowed to
    // put events on those tagged for its own
    const simAws = new SimAws();
    await teamBus(simAws, "orders");
    await teamBus(simAws, "billing");
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["events:PutEvents"],
        condition: { StringEquals: { "aws:ResourceTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;
    const putTo = async (EventBusName: string): Promise<unknown> =>
      simAws.eventBridge().putEvents(
        new PutEventsCommand({
          Entries: [
            {
              EventBusName,
              Source: "orders.service",
              DetailType: "OrderPlaced",
              Detail: "{}",
            },
          ],
        }),
        { caller },
      );

    // When it puts an event on each
    await putTo("orders");
    const error = await assertThrowsErrorAsync(async () => putTo("billing"));

    // Then only its own team's bus takes the event
    assertInstanceOf(error, SimEventBridgeAccessDeniedException);
  });

  it("gives IAM the keys TagResource and UntagResource name", async () => {
    // Given a tagged bus, and a caller allowed to tag and untag only the
    // cost key
    const simAws = new SimAws();
    const ResourceARN = await teamBus(simAws, "orders");
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["events:TagResource", "events:UntagResource"],
        condition: { "ForAllValues:StringEquals": { "aws:TagKeys": ["cost"] } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it sets and removes the cost key, then tries the team key
    await simAws.eventBridge().tagResource(
      new TagResourceCommand({
        ResourceARN,
        Tags: [{ Key: "cost", Value: "42" }],
      }),
      { caller },
    );
    await simAws
      .eventBridge()
      .untagResource(
        new UntagResourceCommand({ ResourceARN, TagKeys: ["cost"] }),
        { caller },
      );
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .eventBridge()
        .untagResource(
          new UntagResourceCommand({ ResourceARN, TagKeys: ["team"] }),
          { caller },
        ),
    );

    // Then only the team key is refused
    assertInstanceOf(error, SimEventBridgeAccessDeniedException);
  });
});
