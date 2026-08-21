import { describe, it } from "vitest";

/* oxlint-disable no-template-curly-in-string */
import { assertIdentical, assertThrowsError } from "@kensio/smartass";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../sim-cfn-deployed-stack.type.js";
import type { CfnTemplateBodyRecord } from "../../template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../template/value/sim-cfn-template-value.js";
import { SimCfnTemplate } from "../../template/sim-cfn-template.js";
import { deployedStackObject } from "../sim-cfn-stack.fixture.js";

const stackName = "OutputAccessorStack";

/** The `Outputs` section a test declares, by Output key. */
type OutputTemplates = Record<string, SimCfnTemplateValue>;

describe("reading one sim CloudFormation Stack Output", () => {
  it("answers the Output as a string", async () => {
    // Given a deployed Stack that declares an Output for its Bucket name
    const stack = await deployedStack({
      SiteBucketName: { Value: { Ref: "SiteBucket" } },
    });

    // When the Output is read by name
    const bucketName: string = stack.output("SiteBucketName");

    // Then it is the resolved value, already a string
    assertIdentical(bucketName, "output-accessor-bucket");
  });

  it("answers an Output resolved through an intrinsic function", async () => {
    // Given a deployed Stack whose Output resolves through Fn::Sub
    const stack = await deployedStack({
      BucketSummary: { Value: { "Fn::Sub": "bucket ${SiteBucket}" } },
    });

    // Then the accessor answers what the intrinsic resolved to
    assertIdentical(
      stack.output("BucketSummary"),
      "bucket output-accessor-bucket",
    );
  });

  it("answers the value the Stack holds after an update", async () => {
    // Given a deployed Stack holding one Output value
    const stack = await deployedStack({
      SiteBucketName: { Value: "before-the-update" },
    });

    // When an update resolves that Output to something else
    await deployedStackObject(stack).update(
      new SimCfnTemplate({
        stackName,
        template: templateBody({
          SiteBucketName: { Value: "after-the-update" },
        }),
      }),
    );
    await stack.waitForUpdateComplete();

    // Then the accessor answers the value the update left behind
    assertIdentical(stack.output("SiteBucketName"), "after-the-update");
  });

  it("reports the Stack and the Output the template never declared", async () => {
    // Given a deployed Stack declaring one Output
    const stack = await deployedStack({
      SiteBucketName: { Value: { Ref: "SiteBucket" } },
    });

    // When another Output is asked for
    const error = assertThrowsError(() => stack.output("SiteBucketArn"));

    // Then the failure names the Stack, the Output, and what is there instead
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack OutputAccessorStack has no Output SiteBucketArn. " +
        "It declares SiteBucketName.",
    );
  });

  it("reports a Stack that declares no Outputs at all", async () => {
    // Given a deployed Stack with no Outputs section
    const stack = await deployedStack(undefined);

    // When an Output is asked for
    const error = assertThrowsError(() => stack.output("SiteBucketName"));

    // Then the failure says the Stack declares none
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack OutputAccessorStack has no Output SiteBucketName. " +
        "It declares no Outputs.",
    );
  });

  it("reports an Output that resolved to a number", async () => {
    // Given a Stack whose template puts a number where a string belongs
    const stack = await deployedStack({ SitePort: { Value: 8080 } });

    // When that Output is read as a string
    const error = assertThrowsError(() => stack.output("SitePort"));

    // Then the failure names the type it found and the value it held
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack OutputAccessorStack Output SitePort resolved to " +
        "a number (8080). A CloudFormation Output is a string.",
    );
  });

  it("reports an Output that resolved to a list", async () => {
    // Given a Stack whose Output holds a list
    const stack = await deployedStack({
      SiteHosts: { Value: ["one.example.com", "two.example.com"] },
    });

    // When that Output is read as a string
    const error = assertThrowsError(() => stack.output("SiteHosts"));

    // Then the failure reports the list it found
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack OutputAccessorStack Output SiteHosts resolved to " +
        'a list (["one.example.com","two.example.com"]). ' +
        "A CloudFormation Output is a string.",
    );
  });

  it("reports an Output that resolved to a record", async () => {
    // Given a Stack whose Output holds a record
    const stack = await deployedStack({
      SiteTags: { Value: { Owner: "platform" } },
    });

    // When that Output is read as a string
    const error = assertThrowsError(() => stack.output("SiteTags"));

    // Then the failure reports the record it found
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack OutputAccessorStack Output SiteTags resolved to " +
        'a record ({"Owner":"platform"}). A CloudFormation Output is a string.',
    );
  });

  it("reports an Output that resolved to null", async () => {
    // Given a Stack whose Output holds null
    const stack = await deployedStack({ SiteOwner: { Value: null } });

    // When that Output is read as a string
    const error = assertThrowsError(() => stack.output("SiteOwner"));

    // Then the failure reports the null it found
    assertIdentical(
      error.message,
      "Sim CloudFormation Stack OutputAccessorStack Output SiteOwner resolved to " +
        "null. A CloudFormation Output is a string.",
    );
  });
});

/** The template body a test deploys, with whatever Outputs it declares. */
function templateBody(
  outputs: OutputTemplates | undefined,
): CfnTemplateBodyRecord {
  return {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "output-accessor-bucket" },
      },
    },
    ...(outputs !== undefined && { Outputs: outputs }),
  };
}

/** A deployed Stack holding one Bucket and the Outputs a test declares. */
async function deployedStack(
  outputs: OutputTemplates | undefined,
): Promise<SimCfnDeployedStack> {
  const stack = await new SimAws()
    .cloudFormation()
    .deployTemplate({ stackName, template: templateBody(outputs) });

  await stack.waitForDeployComplete();

  return stack;
}
