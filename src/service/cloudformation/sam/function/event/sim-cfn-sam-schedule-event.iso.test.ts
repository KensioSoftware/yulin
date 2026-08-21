import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimEventRule } from "../../../../eventbridge/rule/sim-event-rule.js";
import type { SimCfnDeployedStack } from "../../../stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import {
  samFunctionTemplateLogicalId,
  simCfnSamFunctionTemplateFactory,
} from "../sim-cfn-sam-function-template.factory.js";

const startedAt = "2026-07-26T09:00:00.000Z";

/**
 * A simulation whose clock a test moves, since a scheduled function runs when
 * simulated time passes rather than when the host's clock does.
 */
function scheduledSimulation(): SimAws {
  return new SimAws({ clock: new SimFixedClock(new Date(startedAt)) });
}

/**
 * Deploy a SAM function whose `Events` are what the test is about, with a
 * handler recording everything the function is invoked with.
 */
async function deployScheduled(properties: {
  readonly simAws: SimAws;
  readonly events: SimCfnTemplateValueRecord;
  readonly received: unknown[];
}): Promise<SimCfnDeployedStack> {
  const stack = await properties.simAws.cloudFormation().deployTemplate({
    stackName: "reconciliation-stack",
    template: simCfnSamFunctionTemplateFactory.make({
      functionProperties: { Events: properties.events },
    }),
    bindings: [
      {
        logicalId: samFunctionTemplateLogicalId,
        handler: (event: unknown): string => {
          properties.received.push(event);

          return "reconciled";
        },
      },
    ],
  });

  await stack.waitForDeployComplete();

  return stack;
}

describe("SAM Schedule event expansion", () => {
  it("invokes the bound handler as simulated time advances", async () => {
    // Given a SAM function with an hourly Schedule event
    const simAws = scheduledSimulation();
    const received: unknown[] = [];

    // When it is deployed and three simulated hours pass
    const stack = await deployScheduled({
      simAws,
      events: {
        Reconcile: {
          Type: "Schedule",
          Properties: { Schedule: "rate(1 hour)" },
        },
      },
      received,
    });

    await simAws.clock().advanceBy({ hours: 3 });

    // Then the rule the event made invoked the function once an hour, so the
    // permission it was expanded with admitted EventBridge
    assertArrayLength(stack.skippedResources, 0);
    assertArrayLength(received, 3);
  });

  it("names the rule and carries what the event said about it", async () => {
    // Given a Schedule event stating a name, a description and an input
    const simAws = scheduledSimulation();
    const received: unknown[] = [];

    // When it is deployed and an hour passes
    const stack = await deployScheduled({
      simAws,
      events: {
        Reconcile: {
          Type: "Schedule",
          Properties: {
            Schedule: "rate(1 hour)",
            Name: "hourly-reconciliation",
            Description: "Reconciles the day's rates",
            Input: JSON.stringify({ ledger: "rates" }),
          },
        },
      },
      received,
    });

    await simAws.clock().advanceBy({ hours: 1 });

    // Then the rule carries the name and description the event stated
    const rule = stack.getResource("RatesReconcileRule")
      ?.simResource as SimEventRule;

    assertNonNullable(rule);
    assertIdentical(rule.name.value, "hourly-reconciliation");
    assertIdentical(rule.description, "Reconciles the day's rates");

    // And the handler was invoked with the input rather than with the event
    assertObjectEquals(received, [{ ledger: "rates" }]);
  });

  it("leaves a disabled event's function alone as time passes", async () => {
    // Given a Schedule event the template disabled
    const simAws = scheduledSimulation();
    const received: unknown[] = [];

    // When it is deployed and three simulated hours pass
    const stack = await deployScheduled({
      simAws,
      events: {
        Reconcile: {
          Type: "Schedule",
          Properties: { Schedule: "rate(1 hour)", Enabled: false },
        },
      },
      received,
    });

    await simAws.clock().advanceBy({ hours: 3 });

    // Then the rule is there and disabled, and the function never ran
    const rule = stack.getResource("RatesReconcileRule")
      ?.simResource as SimEventRule;

    assertNonNullable(rule);
    assertIdentical(rule.state.value, "DISABLED");
    assertArrayLength(received, 0);
  });

  it("refuses an event stating no schedule rather than guessing one", async () => {
    // Given a Schedule event that never said when to fire
    const simAws = scheduledSimulation();

    const error = await assertThrowsErrorAsync(async () => {
      await deployScheduled({
        simAws,
        events: { Reconcile: { Type: "Schedule", Properties: {} } },
        received: [],
      });
    });

    // Then the deployment failed naming the rule the event expanded into,
    // rather than putting the function on a timer nobody asked for
    assertStringIncludes(error.message, "RatesReconcileRule");
  });
});
