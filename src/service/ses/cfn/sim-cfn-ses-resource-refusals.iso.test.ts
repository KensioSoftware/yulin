import {
  assertIdentical,
  assertInstanceOf,
  assertUndefined,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnStack } from "../../cloudformation/stack/sim-cfn-stack.js";
import { SimSesNotFoundException } from "../error/sim-ses.error.js";
import { simCfnSesResourceCreation } from "./sim-cfn-ses-resource-error.js";

/** A stack with one deployed identity, and the Resource record behind it. */
async function deployedIdentity(): Promise<{
  readonly simAws: SimAws;
  readonly stack: SimCfnStack;
  readonly resource: SimCfnResource;
}> {
  const simAws = new SimAws();
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders",
    template: {
      Resources: {
        SenderIdentity: {
          Type: "AWS::SES::EmailIdentity",
          Properties: { EmailIdentity: "example.com" },
        },
      },
    },
  });
  const resource = stack.resources.get("SenderIdentity");

  assertNonNullable(resource);

  return { simAws, stack, resource };
}

describe("simulated SES CloudFormation refusals", () => {
  it("steps over an SES Resource type it does not simulate", async () => {
    // Given a template declaring a configuration set, which is a real SES
    // Resource type this simulation has no machinery for.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders",
      template: {
        Resources: {
          Transactional: {
            Type: "AWS::SES::ConfigurationSet",
            Properties: { Name: "transactional" },
          },
        },
      },
    });

    // Then the stack deployed with the Resource recorded as unsupported rather
    // than treated as deployed, which is how CloudFormation here handles every
    // Resource type no service claims.
    const resource = stack.resources.get("Transactional");

    assertNonNullable(resource);
    assertUndefined(resource.simResource);
  });

  it("refuses deleting an SES Resource type it does not simulate", async () => {
    // Given a deployed identity, and the factory that made it.
    const { simAws, resource } = await deployedIdentity();

    // When the factory is asked to delete a Resource type it never creates.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sesV2()
        .cfnResourceFactory()
        .delete("ConfigurationSet", resource);
    });

    assertStringIncludes(
      error.message,
      "Unsupported sim SES CloudFormation Resource ConfigurationSet deletion",
    );
  });

  it("refuses creating an SES Resource type it does not simulate", async () => {
    // Given a deployed identity, and the factory that made it.
    const { simAws, stack, resource } = await deployedIdentity();

    // When the factory is asked to create a Resource type it does not know.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sesV2()
        .cfnResourceFactory()
        .create("ContactList", resource, {
          simAws,
          resources: stack.resources,
        });
    });

    assertStringIncludes(
      error.message,
      "Unsupported sim SES CloudFormation Resource ContactList",
    );
  });

  it("names the Resource in a refusal simulated SES made", async () => {
    // When an SES error is raised while a Resource is being created.
    const error = await assertThrowsErrorAsync(async () => {
      await simCfnSesResourceCreation(
        "AWS::SES::Template",
        "WelcomeEmail",
        () => {
          throw new SimSesNotFoundException("Email template does not exist.");
        },
      );
    });

    // Then it is renamed to say which Resource asked, since SES's own message
    // says nothing about where the request came from.
    assertStringIncludes(
      error.message,
      "Invalid AWS::SES::Template Resource WelcomeEmail",
    );
    assertStringIncludes(error.message, "Email template does not exist.");
  });

  it("lets an error that is not SES's own through unchanged", async () => {
    // Given something going wrong that simulated SES did not raise.
    const raised = new TypeError("something else entirely");

    const error = await assertThrowsErrorAsync(async () => {
      await simCfnSesResourceCreation("AWS::SES::Template", "Welcome", () => {
        throw raised;
      });
    });

    // Then it is not renamed. Only SES's own refusals are worth attributing to
    // a Resource; anything else is a bug and should read like one.
    assertInstanceOf(error, TypeError);
    assertIdentical(error, raised);
  });

  it("refuses an EmailIdentity that is not a string", async () => {
    // Given a template whose identity is a number.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "orders",
        template: {
          Resources: {
            SenderIdentity: {
              Type: "AWS::SES::EmailIdentity",
              Properties: { EmailIdentity: 42 },
            },
          },
        },
      });
    });

    assertStringIncludes(error.message, "EmailIdentity must be a string");
  });

  it("refuses a Template property that is not an object", async () => {
    // Given a template whose wording is a string rather than a record.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "orders",
        template: {
          Resources: {
            WelcomeEmail: {
              Type: "AWS::SES::Template",
              Properties: { Template: "welcome" },
            },
          },
        },
      });
    });

    assertStringIncludes(error.message, "Template must be an object");
  });

  it("refuses an attribute AWS::SES::Template does not have", async () => {
    // Given a template reading something off an email template that is not its
    // Id.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "orders",
        template: {
          Resources: {
            WelcomeEmail: {
              Type: "AWS::SES::Template",
              Properties: {
                Template: { TemplateName: "welcome", TextPart: "Hi" },
              },
            },
          },
          Outputs: {
            Arn: { Value: { "Fn::GetAtt": ["WelcomeEmail", "Arn"] } },
          },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "Unsupported AWS::SES::Template attribute Arn",
    );
  });
});
