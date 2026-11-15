import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../role/sim-iam-role-with-policy.factory.js";
import { SimIamResourceTagAuthZ } from "./sim-iam-resource-tag-auth-z.js";

const taggedArn = "arn:aws:example:us-east-1:888888888888:thing/tagged";

/**
 * IAM for one Account, reading `team: orders` as the tags of one resource and
 * none for anything else.
 */
function taggedIam(simAws: SimAws, servicePrefix?: string) {
  return new SimIamResourceTagAuthZ(
    simAws.iam(),
    (resource) => (resource === taggedArn ? { team: "orders" } : undefined),
    servicePrefix,
  );
}

/**
 * A caller allowed `example:Read` where the condition key given is `orders`.
 */
async function callerMatching(simAws: SimAws, conditionKey: string) {
  const role = await simIamRoleWithPolicyFactory.make(
    {
      actions: ["example:Read"],
      condition: { StringEquals: { [conditionKey]: "orders" } },
    },
    simAws,
  );

  return { kind: "arn", arn: role.Arn } as const;
}

describe("resource tags supplied to IAM", () => {
  it("supplies a resource's tags under aws:ResourceTag", async () => {
    // Given a caller allowed only on resources tagged for its team
    const simAws = new SimAws();
    const caller = await callerMatching(simAws, "aws:ResourceTag/team");
    const iam = taggedIam(simAws);

    // When it acts on the tagged resource and on another
    const tagged = iam.authorize({
      action: "example:Read",
      resource: taggedArn,
      caller,
    });
    const other = iam.authorize({
      action: "example:Read",
      resource: `${taggedArn}-other`,
      caller,
    });

    // Then only the tagged resource is allowed
    assertTrue(tagged.isAllowed);
    assertFalse(other.isAllowed);
  });

  it("supplies the tags under a service's own prefix where it names one", async () => {
    // Given a caller whose condition uses the service's prefixed key
    const simAws = new SimAws();
    const caller = await callerMatching(simAws, "example:ResourceTag/team");

    // When it acts on the tagged resource, with and without the prefix
    const prefixed = taggedIam(simAws, "example").authorize({
      action: "example:Read",
      resource: taggedArn,
      caller,
    });
    const bare = taggedIam(simAws).authorize({
      action: "example:Read",
      resource: taggedArn,
      caller,
    });

    // Then the prefixed key matches only where the service supplies it
    assertTrue(prefixed.isAllowed);
    assertFalse(bare.isAllowed);
  });

  it("leaves a value the request supplies under the same key alone", async () => {
    // Given a caller allowed only on resources tagged for its team
    const simAws = new SimAws();
    const caller = await callerMatching(simAws, "aws:ResourceTag/team");

    // When the request supplies a different value for the same key
    const decision = taggedIam(simAws).authorize({
      action: "example:Read",
      resource: taggedArn,
      caller,
      conditionContext: { "aws:ResourceTag/team": "billing" },
    });

    // Then the request's value is the one evaluated
    assertFalse(decision.isAllowed);
  });
});
