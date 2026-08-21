import { PutEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimEventRule } from "../../../../eventbridge/rule/sim-event-rule.js";
import type { SimCfnDeployedStack } from "../../../stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import {
  samFunctionTemplateLogicalId,
  simCfnSamFunctionTemplateFactory,
} from "../sim-cfn-sam-function-template.factory.js";

const ratePattern = { source: ["rates.service"] };

/**
 * Deploy a SAM function whose `Events` are what the test is about, with a
 * handler recording everything the function is invoked with.
 */
async function deployMatching(properties: {
  readonly simAws: SimAws;
  readonly events: SimCfnTemplateValueRecord;
  readonly resources?: SimCfnTemplateValueRecord;
  readonly received: unknown[];
}): Promise<SimCfnDeployedStack> {
  const stack = await properties.simAws.cloudFormation().deployTemplate({
    stackName: "rates-stack",
    template: simCfnSamFunctionTemplateFactory.make({
      functionProperties: { Events: properties.events },
      resources: properties.resources ?? {},
    }),
    bindings: [
      {
        logicalId: samFunctionTemplateLogicalId,
        handler: (event: unknown): string => {
          properties.received.push(event);

          return "published";
        },
      },
    ],
  });

  await stack.waitForDeployComplete();

  return stack;
}

/**
 * Put one rate event, on the default bus unless told otherwise, and wait for
 * what it caused.
 */
async function putRate(simAws: SimAws, busName?: string): Promise<void> {
  await simAws.eventBridge().putEvents(
    new PutEventsCommand({
      Entries: [
        {
          Source: "rates.service",
          DetailType: "RatePublished",
          Detail: JSON.stringify({ currency: "GBP" }),
          EventBusName: busName,
        },
      ],
    }),
  );

  await simAws.backgroundTasksComplete();
}

describe("SAM EventBridgeRule event expansion", () => {
  it("invokes the bound handler for an event the pattern matches", async () => {
    // Given a SAM function with an EventBridgeRule event stating a pattern
    const simAws = new SimAws();
    const received: unknown[] = [];

    const stack = await deployMatching({
      simAws,
      events: {
        Published: {
          Type: "EventBridgeRule",
          Properties: { Pattern: ratePattern },
        },
      },
      received,
    });

    // When a matching event is put, and then one the pattern does not match
    await putRate(simAws);

    await simAws.eventBridge().putEvents(
      new PutEventsCommand({
        Entries: [
          {
            Source: "orders.service",
            DetailType: "OrderPlaced",
            Detail: JSON.stringify({ orderId: "order-1" }),
          },
        ],
      }),
    );

    await simAws.backgroundTasksComplete();

    // Then only the matching event reached the function, so the rule carries
    // the pattern and the permission it was expanded with admitted the rule
    assertArrayLength(stack.skippedResources, 0);
    assertArrayLength(received, 1);
  });

  it("names the rule what the event called it", async () => {
    // Given an EventBridgeRule event stating a rule name and a state
    const simAws = new SimAws();
    const received: unknown[] = [];

    // When it is deployed
    const stack = await deployMatching({
      simAws,
      events: {
        Published: {
          Type: "EventBridgeRule",
          Properties: {
            Pattern: ratePattern,
            RuleName: "published-rates",
            State: "DISABLED",
          },
        },
      },
      received,
    });

    // Then the rule carries the name and state the event stated, and a
    // matching event reaches nothing
    const rule = stack.getResource("RatesPublishedRule")
      ?.simResource as SimEventRule;

    assertNonNullable(rule);
    assertIdentical(rule.name.value, "published-rates");
    assertIdentical(rule.state.value, "DISABLED");

    await putRate(simAws);

    assertArrayLength(received, 0);
  });

  it("watches the bus the event named rather than the default one", async () => {
    // Given an event naming a bus the template declares beside the function
    const simAws = new SimAws();
    const received: unknown[] = [];

    await deployMatching({
      simAws,
      events: {
        Published: {
          Type: "EventBridgeRule",
          Properties: {
            Pattern: ratePattern,
            EventBusName: { Ref: "RatesBus" },
          },
        },
      },
      resources: {
        RatesBus: {
          Type: "AWS::Events::EventBus",
          Properties: { Name: "rates" },
        },
      },
      received,
    });

    // When a matching event is put on the default bus, and then on that bus
    await putRate(simAws);

    assertArrayLength(received, 0);

    await putRate(simAws, "rates");

    // Then only the event on the named bus reached the function
    assertArrayLength(received, 1);
  });

  it("refuses an event stating no pattern rather than guessing one", async () => {
    // Given an EventBridgeRule event that never said what to match
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await deployMatching({
        simAws,
        events: { Published: { Type: "EventBridgeRule", Properties: {} } },
        received: [],
      });
    });

    // Then the deployment failed naming the rule the event expanded into,
    // rather than invoking the function for events it never asked for
    assertStringIncludes(error.message, "RatesPublishedRule");
  });
});
