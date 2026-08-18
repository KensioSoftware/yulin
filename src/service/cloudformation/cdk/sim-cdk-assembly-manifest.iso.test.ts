import {
  assertArrayEquals,
  assertIdentical,
  assertMapSize,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../util/filesystem/temporary-directory.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

describe("Reading a CDK cloud assembly manifest [iso]", () => {
  it("falls back to the names CDK synthesizes by for an artifact carrying no properties", async () => {
    // Given a manifest whose Stack artifact names neither its template file nor
    // the Stack it deploys as.
    const directory = new TemporaryDirectory();

    await directory.writeFile(
      ["cdk.out", "manifest.json"],
      jsonStringify({
        artifacts: {
          SiteStack: { type: "aws:cloudformation:stack" },
          SiteStackAssets: { type: "cdk:asset-manifest" },
        },
      }),
    );
    await directory.writeFile(
      ["cdk.out", "SiteStack.template.json"],
      jsonStringify({
        Resources: {
          SiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: "fallback-site-bucket" },
          },
        },
      }),
    );

    // When the assembly is deployed.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    const stacks = await simAws
      .cloudFormation()
      .deployCdkOut(directory.join("cdk.out"));

    // Then the artifact ID named both the template file and the Stack, and the
    // artifact that is not a Stack was left alone.
    assertArrayEquals(stacks.keys().toArray(), ["SiteStack"]);
    assertIdentical(stacks.get("SiteStack")?.stackName, "SiteStack");
    assertNonNullable(simAws.s3().getSimBucketByName("fallback-site-bucket"));
  });

  it("deploys nothing from a manifest holding no artifacts at all", async () => {
    // Given a cloud assembly a synth wrote nothing into.
    const directory = new TemporaryDirectory();

    await directory.writeFile(["cdk.out", "manifest.json"], jsonStringify({}));

    // When it is deployed.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    const stacks = await simAws
      .cloudFormation()
      .deployCdkOut(directory.join("cdk.out"));

    // Then there was nothing in it to deploy.
    assertMapSize(stacks, 0);
  });

  it("says the assembly holds no Stacks when one is named and there are none", async () => {
    // Given the same empty cloud assembly.
    const directory = new TemporaryDirectory();

    await directory.writeFile(["cdk.out", "manifest.json"], jsonStringify({}));

    // When a Stack is named in it.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployCdkOut({
        directoryPath: directory.join("cdk.out"),
        stackNames: ["SiteStack"],
      }),
    );

    // Then the failure says there was nothing it could have been asked for.
    assertStringIncludes(error.message, "holds no Stack named SiteStack");
    assertStringIncludes(error.message, "It holds no Stacks at all.");
  });
});
