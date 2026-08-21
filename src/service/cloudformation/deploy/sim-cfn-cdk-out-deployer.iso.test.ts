import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import {
  assemblyStackBucketName,
  simCdkCloudAssemblyFactory,
} from "../cdk/sim-cdk-cloud-assembly.factory.js";

describe("Deploying a CDK cloud assembly [iso]", () => {
  it("deploys each Stack into the region its own environment names", async () => {
    // Given a synthesized cloud assembly holding two Stacks in two regions.
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [
        { artifactId: "SiteStack", regionName: "eu-west-2" },
        { artifactId: "DnsStack", regionName: "us-east-1" },
      ],
    });

    // When the assembly directory is deployed.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    const stacks = await simAws
      .cloudFormation()
      .deployCdkOut(directory.join("cdk.out"));

    // Then each Stack's work landed in the region its environment names.
    assertNonNullable(
      simAws
        .region("eu-west-2")
        .s3()
        .getSimBucketByName(assemblyStackBucketName("SiteStack")),
    );
    assertNonNullable(
      simAws
        .region("us-east-1")
        .s3()
        .getSimBucketByName(assemblyStackBucketName("DnsStack")),
    );

    // And nothing was deployed into the region the caller happened to be in.
    assertUndefined(
      simAws
        .region("eu-west-2")
        .s3()
        .getSimBucketByName(assemblyStackBucketName("DnsStack")),
    );

    // And both Stacks came back by name.
    assertArrayEquals(stacks.keys().toArray().toSorted(compareStackNames), [
      "DnsStack",
      "SiteStack",
    ]);
  });

  it("deploys a Stack after the Stack the manifest says it depends on", async () => {
    // Given an assembly holding a Stack ahead of the one it depends on.
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [
        {
          artifactId: "SiteStack",
          regionName: "eu-west-2",
          dependencies: ["DataStack"],
        },
        { artifactId: "DataStack", regionName: "eu-west-2" },
      ],
    });

    // When the assembly is deployed.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    const stacks = await simAws
      .cloudFormation()
      .deployCdkOut(directory.join("cdk.out"));

    // Then the dependency went first, whatever order the manifest holds them in.
    assertArrayEquals(stacks.keys().toArray(), ["DataStack", "SiteStack"]);
  });

  it("deploys only the named Stacks, leaving the rest of the assembly alone", async () => {
    // Given an assembly that also synthesizes a deployment pipeline no test wants.
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [
        { artifactId: "SiteStack", regionName: "eu-west-2" },
        { artifactId: "PipelineStack", regionName: "eu-west-2" },
      ],
    });

    // When only the site Stack is named.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    const stacks = await simAws.cloudFormation().deployCdkOut({
      directoryPath: directory.join("cdk.out"),
      stackNames: ["SiteStack"],
    });

    // Then the pipeline Stack was never deployed.
    assertArrayEquals(stacks.keys().toArray(), ["SiteStack"]);
    assertUndefined(
      simAws
        .region("eu-west-2")
        .s3()
        .getSimBucketByName(assemblyStackBucketName("PipelineStack")),
    );
  });

  it("deploys the named Stacks in the order they are named", async () => {
    // Given an assembly holding two Stacks with no dependency between them.
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [
        { artifactId: "SiteStack", regionName: "eu-west-2" },
        { artifactId: "DnsStack", regionName: "us-east-1" },
      ],
    });

    // When they are named the other way round to the manifest.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    const stacks = await simAws.cloudFormation().deployCdkOut({
      directoryPath: directory.join("cdk.out"),
      stackNames: ["DnsStack", "SiteStack"],
    });

    // Then they deployed in the order they were named.
    assertArrayEquals(stacks.keys().toArray(), ["DnsStack", "SiteStack"]);
  });

  it("deploys a depended-on Stack first however the two are named", async () => {
    // Given an assembly whose manifest says one Stack comes after another.
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [
        {
          artifactId: "ConsumerStack",
          regionName: "eu-west-2",
          dependencies: ["ProducerStack"],
        },
        { artifactId: "ProducerStack", regionName: "eu-west-2" },
      ],
    });

    // When the consumer is named first.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    const stacks = await simAws.cloudFormation().deployCdkOut({
      directoryPath: directory.join("cdk.out"),
      stackNames: ["ConsumerStack", "ProducerStack"],
    });

    // Then the manifest dependency still went first.
    assertArrayEquals(stacks.keys().toArray(), [
      "ProducerStack",
      "ConsumerStack",
    ]);
  });

  it("deploys a Stack once when it is named twice", async () => {
    // Given an assembly holding a Stack whose name and artifact ID differ.
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [
        {
          artifactId: "SiteStackArtifact",
          stackName: "SiteStack",
          regionName: "eu-west-2",
        },
      ],
    });

    // When it is named by both.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    const stacks = await simAws.cloudFormation().deployCdkOut({
      directoryPath: directory.join("cdk.out"),
      stackNames: ["SiteStack", "SiteStackArtifact"],
    });

    // Then it deployed once.
    assertArrayEquals(stacks.keys().toArray(), ["SiteStack"]);
  });

  it("deploys an environment-agnostic Stack into the region it is asked in", async () => {
    // Given an assembly whose Stack was synthesized with no `env`.
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [{ artifactId: "SiteStack" }],
    });

    // When it is deployed through a scope in a region of the caller's choosing.
    const simAws = new SimAws();

    await simAws
      .region("ap-southeast-2")
      .cloudFormation()
      .deployCdkOut(directory.join("cdk.out"));

    // Then that is the region it landed in.
    assertNonNullable(
      simAws
        .region("ap-southeast-2")
        .s3()
        .getSimBucketByName(assemblyStackBucketName("SiteStack")),
    );
  });

  it("answers with the same Stack a single-template deployment answers with", async () => {
    // Given a deployed cloud assembly.
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [{ artifactId: "SiteStack", regionName: "eu-west-2" }],
    });
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    // When the Stack is taken from what the deployment answered with.
    const stacks = await simAws
      .cloudFormation()
      .deployCdkOut(directory.join("cdk.out"));
    const stack = stacks.get("SiteStack");

    // Then it is the Stack simulated CloudFormation holds under that name.
    assertNonNullable(stack);
    assertIdentical(stack.stackName, "SiteStack");
    assertIdentical(stack, simAws.cloudFormation().getStackByName("SiteStack"));
  });

  it("deploys a Stack named by its CDK artifact ID when the Stack name differs", async () => {
    // Given an assembly holding a Stack under a Stage, where the artifact ID
    // and the Stack name are not the same.
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [
        {
          artifactId: "ProdStageSiteStack",
          stackName: "Prod-SiteStack",
          regionName: "eu-west-2",
        },
      ],
    });

    // When it is named by its artifact ID.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    const stacks = await simAws.cloudFormation().deployCdkOut({
      directoryPath: directory.join("cdk.out"),
      stackNames: ["ProdStageSiteStack"],
    });

    // Then it deployed under the name the manifest gives it.
    assertArrayEquals(stacks.keys().toArray(), ["Prod-SiteStack"]);
  });

  it("deploys a Stack after the one whose export it imports", async () => {
    // Given an assembly where a Stack shares a value with another, the way CDK
    // emits an Export on the producer and an Fn::ImportValue on the consumer.
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [
        {
          artifactId: "ConsumerStack",
          regionName: "eu-west-2",
          dependencies: ["ProducerStack"],
          resources: {
            ConsumerTopic: {
              Type: "AWS::SNS::Topic",
              Properties: {
                TopicName: "consumer-topic",
                DisplayName: { "Fn::ImportValue": "ProducerStack:BucketName" },
              },
            },
          },
        },
        {
          artifactId: "ProducerStack",
          regionName: "eu-west-2",
          outputs: {
            BucketName: {
              Value: { Ref: "ProducerStackBucket" },
              Export: { Name: "ProducerStack:BucketName" },
            },
          },
        },
      ],
    });

    // When the assembly is deployed in one call.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

    const stacks = await simAws
      .cloudFormation()
      .deployCdkOut(directory.join("cdk.out"));

    // Then the producer had published its export by the time the consumer
    // imported it, so the import resolved to the value the producer exported.
    assertIdentical(
      stacks.get("ConsumerStack")?.getResource("ConsumerTopic")?.properties[
        "DisplayName"
      ],
      assemblyStackBucketName("ProducerStack"),
    );
  });
});

function compareStackNames(left: string, right: string): number {
  return left.localeCompare(right);
}
