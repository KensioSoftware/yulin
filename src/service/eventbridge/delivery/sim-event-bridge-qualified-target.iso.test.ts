import {
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  assertArrayEquals,
  assertArrayLength,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simLambdaAliasedFunction,
  simLambdaAllowAliasInvoke,
} from "../../../../test/lambda/alias-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simEventBridgeServicePrincipal } from "./sim-event-bridge-delivery.js";

const orderPattern = JSON.stringify({ source: ["orders.service"] });

/**
 * A rule sending order events to one target, and one order event put through
 * it.
 */
async function deliverOrderTo(
  simAws: SimAws,
  targetArn: string,
): Promise<void> {
  await simAws
    .eventBridge()
    .putRule(
      new PutRuleCommand({ Name: "orders", EventPattern: orderPattern }),
    );
  await simAws.eventBridge().putTargets(
    new PutTargetsCommand({
      Rule: "orders",
      Targets: [{ Id: "fulfilment", Arn: targetArn }],
    }),
  );
  await simAws.eventBridge().putEvents(
    new PutEventsCommand({
      Entries: [
        { Source: "orders.service", DetailType: "OrderPlaced", Detail: "{}" },
      ],
    }),
  );

  await simAws.backgroundTasksComplete();
}

describe("An EventBridge rule target naming a Lambda alias", () => {
  it("invokes the version the alias points at", async () => {
    // Given a function whose alias admits EventBridge.
    const simAws = new SimAws();
    const fulfilment = await simLambdaAliasedFunction(simAws, "fulfilment");
    await simLambdaAllowAliasInvoke(
      simAws,
      "fulfilment",
      simEventBridgeServicePrincipal,
    );

    // When a rule targeting the alias matches an event.
    await deliverOrderTo(simAws, fulfilment.aliasArn);

    // Then the version behind the alias ran, rather than `$LATEST`.
    assertArrayEquals(fulfilment.ranAs, [fulfilment.version]);
    assertArrayLength(simAws.eventBridge().deliveryFailures, 0);
  });

  it("reports a target naming no version or alias", async () => {
    // Given a function with an alias, and a rule targeting one it does not
    // have.
    const simAws = new SimAws();
    const fulfilment = await simLambdaAliasedFunction(simAws, "fulfilment");
    await simLambdaAllowAliasInvoke(
      simAws,
      "fulfilment",
      simEventBridgeServicePrincipal,
    );

    // When the rule matches an event.
    await deliverOrderTo(simAws, `${fulfilment.functionArn}:old`);

    // Then nothing ran, and the failure says the qualifier reaches nothing.
    // Real EventBridge checks no target at `PutTargets` time, so this is where
    // a rule pointing at nothing is found, as it is for a missing function.
    assertArrayLength(fulfilment.ranAs, 0);

    const [failure] = simAws.eventBridge().deliveryFailures;

    assertNonNullable(failure);
    assertStringIncludes(
      failure.message,
      "names no simulated Lambda function version or alias",
    );
  });
});
