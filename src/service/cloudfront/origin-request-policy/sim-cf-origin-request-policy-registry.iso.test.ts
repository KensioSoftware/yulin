import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
  assertUndefined,
  assertUuidV4,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimCloudFrontOriginRequestPolicyAlreadyExists } from "../error/sim-cf-origin-request-policy.error.js";
import { SimCloudFrontOriginRequestPolicyRegistry } from "./sim-cf-origin-request-policy-registry.js";
import { SimCloudFrontOriginRequestPolicy } from "./sim-cf-origin-request-policy.js";
import { simCfManagedOriginRequestPolicyIds } from "./sim-cf-managed-origin-request-policies.js";

describe("SimCloudFrontOriginRequestPolicyRegistry", () => {
  it("holds a policy a template created, by ID and by name", () => {
    // Given a registry holding one policy.
    const registry = new SimCloudFrontOriginRequestPolicyRegistry();
    const policy = new SimCloudFrontOriginRequestPolicy({
      name: "BeaconPolicy",
    });

    registry.add(policy);

    // Then it answers to both the ID a Behavior names and the name that
    // decides whether another policy may be stored.
    assertIdentical(registry.byId(policy.id), policy);
    assertIdentical(registry.byName("BeaconPolicy"), policy);
  });

  it("gives a policy an ID of its own where none was supplied", () => {
    // Given a policy built without an ID, which is how a template creates one.
    const policy = new SimCloudFrontOriginRequestPolicy({
      name: "BeaconPolicy",
    });

    // Then it has an ID of the shape CloudFront hands back.
    assertUuidV4(policy.id);
    assertUndefined(policy.comment);
  });

  it("keeps the comment a template gave a policy", () => {
    // Given a policy carrying a comment.
    const policy = new SimCloudFrontOriginRequestPolicy({
      name: "BeaconPolicy",
      comment: "Carries the Origin header and nothing else",
    });

    // Then the comment is what the template wrote.
    assertIdentical(
      policy.comment,
      "Carries the Origin header and nothing else",
    );
  });

  it("refuses a second policy claiming a name", () => {
    // Given a registry already holding a policy under a name.
    const registry = new SimCloudFrontOriginRequestPolicyRegistry();

    registry.add(
      new SimCloudFrontOriginRequestPolicy({ name: "BeaconPolicy" }),
    );

    // When another policy claims the same name.
    const error = assertThrowsError(() => {
      registry.add(
        new SimCloudFrontOriginRequestPolicy({ name: "BeaconPolicy" }),
      );
    });

    // Then it is refused the way CloudFront refuses one.
    assertInstanceOf(error, SimCloudFrontOriginRequestPolicyAlreadyExists);
  });

  it("forgets a policy it was told to remove", () => {
    // Given a registry holding a policy.
    const registry = new SimCloudFrontOriginRequestPolicyRegistry();
    const policy = new SimCloudFrontOriginRequestPolicy({
      name: "BeaconPolicy",
    });

    registry.add(policy);

    // When the policy is removed.
    registry.remove(policy.id);

    // Then nothing answers to its ID or its name.
    assertUndefined(registry.byId(policy.id));
    assertUndefined(registry.byName("BeaconPolicy"));
  });

  it("answers every managed policy ID AWS publishes", () => {
    // Given a fresh registry, which no template has reached yet.
    const registry = new SimCloudFrontOriginRequestPolicyRegistry();

    // Then each of CloudFront's managed policies is already there.
    for (const managedId of Object.values(simCfManagedOriginRequestPolicyIds)) {
      assertInstanceOf(
        registry.byId(managedId),
        SimCloudFrontOriginRequestPolicy,
      );
    }

    assertIdentical(
      registry.byId(simCfManagedOriginRequestPolicyIds.allViewer)?.name,
      "AllViewer",
    );
  });

  it("leaves a managed policy's name free for a template's own", () => {
    // Given a registry and a template creating a policy under a managed name.
    const registry = new SimCloudFrontOriginRequestPolicyRegistry();
    const policy = new SimCloudFrontOriginRequestPolicy({ name: "AllViewer" });

    registry.add(policy);

    // Then the template's policy is stored, and the managed one is where it
    // was.
    assertIdentical(registry.byName("AllViewer"), policy);
    assertIdentical(
      registry.byId(simCfManagedOriginRequestPolicyIds.allViewer)?.name,
      "AllViewer",
    );
  });

  it("answers nothing for an ID from a real account", () => {
    // Given a fresh registry.
    const registry = new SimCloudFrontOriginRequestPolicyRegistry();

    // Then a policy ID that is neither managed nor created here is unknown.
    assertUndefined(registry.byId("11111111-2222-3333-4444-555555555555"));
  });
});
