import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedResource } from "../../cloudformation/resource/sim-cfn-deployed-resource.type.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import {
  deployedResourceObject,
  deployedStackObject,
} from "../../cloudformation/stack/sim-cfn-stack.fixture.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimPersonalizeResourceNotFoundException } from "../error/sim-personalize.error.js";
import { simCfnPersonalizeResourceCreation } from "./sim-cfn-personalize-resource-error.js";

/** The five real AWS::Personalize types this simulation has no machinery for. */
const unsupportedResourceTypes = [
  "BatchInferenceJob",
  "BatchSegmentJob",
  "DataDeletionJob",
  "MetricAttribution",
  "Recipe",
];

/** Deploy one dataset group, and the Resource record behind it. */
async function deployedDatasetGroup(
  properties?: SimCfnTemplateValueRecord,
): Promise<{
  readonly simAws: SimAws;
  readonly stack: SimCfnDeployedStack;
  readonly resource: SimCfnDeployedResource;
}> {
  const simAws = new SimAws();
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "catalogue-stack",
    template: {
      Resources: {
        Catalogue: {
          Type: "AWS::Personalize::DatasetGroup",
          Properties: properties ?? { Name: "catalogue" },
        },
      },
    },
  });
  const resource = stack.getResource("Catalogue");

  assertNonNullable(resource);

  return { simAws, stack, resource };
}

/** Deploy a dataset group whose stack reads one attribute off it. */
async function deployWithAttribute(attributeName: string): Promise<void> {
  await new SimAws().cloudFormation().deployTemplate({
    stackName: "catalogue-stack",
    template: {
      Resources: {
        Catalogue: {
          Type: "AWS::Personalize::DatasetGroup",
          Properties: { Name: "catalogue" },
        },
      },
      Outputs: {
        Read: { Value: { "Fn::GetAtt": ["Catalogue", attributeName] } },
      },
    },
  });
}

describe("simulated Personalize CloudFormation refusals", () => {
  it.each(unsupportedResourceTypes)(
    "steps over an AWS::Personalize::%s it does not simulate",
    async (resourceTypeName) => {
      // Given a template declaring one of the job and metric types, which work
      // over data simulated Personalize never reads.
      const simAws = new SimAws();
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "catalogue-stack",
        template: {
          Resources: {
            Catalogue: {
              Type: "AWS::Personalize::DatasetGroup",
              Properties: { Name: "catalogue" },
            },
            Unsupported: {
              Type: `AWS::Personalize::${resourceTypeName}`,
              Properties: { Name: "nightly" },
            },
          },
        },
      });

      // Then the rest of the stack deployed, and the Resource is recorded as
      // unsupported with the type named in the reason.
      const resource = stack.getResource("Unsupported");

      assertNonNullable(simAws.personalize().findDatasetGroup("catalogue"));
      assertNonNullable(resource);
      assertUndefined(resource.simResource);
      assertArrayLength(stack.skippedResources, 1);
      assertIdentical(
        resource.skippedReason,
        `Unsupported sim Personalize CloudFormation Resource ${
          resourceTypeName
        }`,
      );
    },
  );

  it("refuses creating a Personalize Resource type it does not simulate", async () => {
    // Given a deployed dataset group, and the factory that made it.
    const { simAws, stack, resource } = await deployedDatasetGroup();

    // When the factory is asked to create a type it does not know.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .personalize()
        .cfnResourceFactory()
        .create("Recipe", deployedResourceObject(resource), {
          simAws,
          resources: deployedStackObject(stack).resourceMap,
        });
    });

    assertStringIncludes(
      error.message,
      "Unsupported sim Personalize CloudFormation Resource Recipe",
    );
  });

  it("refuses deleting a Personalize Resource type it does not simulate", async () => {
    // Given a deployed dataset group, and the factory that made it.
    const { simAws, resource } = await deployedDatasetGroup();

    // When the factory is asked to delete a type it never creates.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .personalize()
        .cfnResourceFactory()
        .delete(
          "MetricAttribution",
          deployedResourceObject(resource),
          {} as never,
        );
    });

    assertStringIncludes(
      error.message,
      "Unsupported sim Personalize CloudFormation Resource " +
        "MetricAttribution deletion",
    );
  });

  it("names the Resource in a refusal simulated Personalize made", async () => {
    // When a Personalize error is raised while a Resource is being created.
    const error = await assertThrowsErrorAsync(async () => {
      await simCfnPersonalizeResourceCreation(
        "AWS::Personalize::Solution",
        "RelatedItems",
        () => {
          throw new SimPersonalizeResourceNotFoundException(
            "Personalize can't find the dataset group 'catalogue'",
          );
        },
      );
    });

    // Then it is renamed to say which Resource asked, since Personalize's own
    // message says nothing about where the request came from.
    assertStringIncludes(
      error.message,
      "Invalid AWS::Personalize::Solution Resource RelatedItems",
    );
    assertStringIncludes(error.message, "can't find the dataset group");
  });

  it("lets an error that is not Personalize's own through unchanged", async () => {
    // Given something going wrong that simulated Personalize did not raise.
    const raised = new TypeError("something else entirely");

    const error = await assertThrowsErrorAsync(async () => {
      await simCfnPersonalizeResourceCreation(
        "AWS::Personalize::Schema",
        "Interactions",
        () => {
          throw raised;
        },
      );
    });

    // Then it is not renamed. Only Personalize's own refusals are worth
    // attributing to a Resource, and anything else is a bug that should read
    // like one.
    assertInstanceOf(error, TypeError);
    assertIdentical(error, raised);
  });

  it("refuses a dataset group with no Name, in Personalize's own words", async () => {
    // Given a template leaving the Name off, which CloudFormation requires and
    // has no way to generate for a Personalize resource.
    const error = await assertThrowsErrorAsync(async () => {
      await deployedDatasetGroup({});
    });

    // Then the refusal is the one CreateDatasetGroup gives an SDK caller, with
    // the Resource that asked named alongside it.
    assertStringIncludes(
      error.message,
      "Invalid AWS::Personalize::DatasetGroup Resource Catalogue",
    );
    assertStringIncludes(error.message, "A dataset group needs a name");
  });

  it("refuses a domain Personalize does not have", async () => {
    const error = await assertThrowsErrorAsync(async () => {
      await deployedDatasetGroup({ Name: "catalogue", Domain: "GROCERY" });
    });

    assertStringIncludes(
      error.message,
      "'GROCERY' is not a Personalize domain",
    );
  });

  it("refuses a Name that is not a string", async () => {
    const error = await assertThrowsErrorAsync(async () => {
      await deployedDatasetGroup({ Name: 42 });
    });

    assertStringIncludes(error.message, "Name must be a string");
  });

  it("refuses an attribute AWS::Personalize::DatasetGroup does not have", async () => {
    // Given a template reading the ARN off the group under the name another
    // Personalize type publishes it as.
    const error = await assertThrowsErrorAsync(async () => {
      await deployWithAttribute("SolutionArn");
    });

    // Then the deploy fails. Answering it would let a template deploy here and
    // fail on AWS.
    assertStringIncludes(
      error.message,
      "Unsupported AWS::Personalize::DatasetGroup attribute SolutionArn",
    );
  });

  it("records a property no AWS::Personalize::Schema has", async () => {
    // Given a template misspelling the only property that matters.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "catalogue-stack",
      template: {
        Resources: {
          InteractionsSchema: {
            Type: "AWS::Personalize::Schema",
            Properties: { Name: "interactions", Schema: "{}", Domainn: "X" },
          },
        },
      },
    });

    // Then the schema deployed with the stray property recorded. Real
    // CloudFormation refuses it, and a stack failing over a property that
    // arrived last week is a worse way to find out.
    assertIdentical(
      stack.ignoredProperties[0]?.reason,
      "Domainn is not a property simulated Personalize reads from " +
        "AWS::Personalize::Schema",
    );
  });
});

describe("AWS::Personalize::Solution property types", () => {
  it("reads a boolean CloudFormation carried as a string", async () => {
    // Given a template whose switches came through as strings, which is what a
    // String Parameter or an Fn::Sub leaves behind.
    const simAws = new SimAws();
    await simAws.cloudFormation().deployTemplate({
      stackName: "catalogue-stack",
      template: {
        Resources: {
          Catalogue: {
            Type: "AWS::Personalize::DatasetGroup",
            Properties: { Name: "catalogue" },
          },
          RelatedItems: {
            Type: "AWS::Personalize::Solution",
            Properties: {
              Name: "related-items",
              DatasetGroupArn: {
                "Fn::GetAtt": ["Catalogue", "DatasetGroupArn"],
              },
              PerformAutoML: "false",
              PerformHPO: true,
            },
          },
        },
      },
    });

    // Then each is the boolean it stands for. Storing the string would read
    // back as configured and mean the opposite of what it says.
    const solution = simAws.personalize().findSolution("related-items");

    assertNonNullable(solution);
    assertFalse(solution.performAutoML);
    assertTrue(solution.performHPO);
  });

  it("refuses a switch that is neither a boolean nor true or false", async () => {
    const error = await assertThrowsErrorAsync(async () => {
      await new SimAws().cloudFormation().deployTemplate({
        stackName: "catalogue-stack",
        template: {
          Resources: {
            RelatedItems: {
              Type: "AWS::Personalize::Solution",
              Properties: { Name: "related-items", PerformHPO: 3 },
            },
          },
        },
      });
    });

    assertStringIncludes(error.message, "PerformHPO must be a boolean");
  });
});
