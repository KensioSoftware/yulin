import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import {
  SimCfnResource,
  type SimCloudFormationResourceCreateContext,
} from "./sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "./factory/sim-cfn-resource-factory.type.js";

describe("SimCfnResource", () => {
  it("exposes initial template state before creation", () => {
    // Given a CloudFormation Resource template with Type, Properties and
    // DependsOn fields.
    const simAws = new SimAws();
    const resource = new SimCfnResource({
      accountRegionScope: simAws.accountRegionScope().accountRegionScope,
      logicalId: "TestResource",
      template: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "test-bucket",
        },
        DependsOn: ["FirstDependency", 123, "SecondDependency"],
      },
    });

    // When the Resource is inspected before creation.
    const dependencies = resource.dependencies();

    // Then the raw template values are exposed in Resource-shaped form.
    assertIdentical(resource.logicalId, "TestResource");
    assertIdentical(resource.status, "CREATE_PENDING");
    assertIdentical(resource.deployed, false);
    assertIdentical(resource.createComplete, false);
    assertIdentical(resource.type, "AWS::S3::Bucket");
    assertIdentical(resource.properties["BucketName"], "test-bucket");
    assertUndefined(resource.simResource);
    assertUndefined(resource.error);
    assertArrayLength(dependencies, 2);
    assertIdentical(dependencies[0], "FirstDependency");
    assertIdentical(dependencies[1], "SecondDependency");
  });

  it("returns empty defaults for non-Resource-shaped template fields", () => {
    // Given a template where Type and Properties are not valid Resource fields.
    const simAws = new SimAws();
    const resource = new SimCfnResource({
      accountRegionScope: simAws.accountRegionScope().accountRegionScope,
      logicalId: "TestResource",
      template: {
        Type: 123,
        Properties: ["not", "a", "record"],
        DependsOn: 456,
      },
    });

    // When the Resource fields are read.
    const properties = resource.properties;
    const dependencies = resource.dependencies();

    // Then invalid optional fields are treated as absent.
    assertUndefined(resource.type);
    assertIdentical(Object.keys(properties).length, 0);
    assertArrayLength(dependencies, 0);
  });

  it("supports a single string dependency", () => {
    // Given a Resource with DependsOn declared as a single logical ID string.
    const simAws = new SimAws();
    const resource = new SimCfnResource({
      accountRegionScope: simAws.accountRegionScope().accountRegionScope,
      logicalId: "TestResource",
      template: {
        DependsOn: "SingleDependency",
      },
    });

    // When dependencies are read.
    const dependencies = resource.dependencies();

    // Then the dependency is returned as a one-item list.
    assertArrayLength(dependencies, 1);
    assertIdentical(dependencies[0], "SingleDependency");
  });

  it("allows creation only after all dependencies are complete", () => {
    // Given a Resource depending on one complete Resource and one pending
    // Resource.
    const simAws = new SimAws();
    const completeDependency = new SimCfnResource({
      accountRegionScope: simAws.accountRegionScope().accountRegionScope,
      logicalId: "CompleteDependency",
      template: {},
    });
    completeDependency.markCreateComplete();

    const pendingDependency = new SimCfnResource({
      accountRegionScope: simAws.accountRegionScope().accountRegionScope,
      logicalId: "PendingDependency",
      template: {},
    });

    const resource = new SimCfnResource({
      accountRegionScope: simAws.accountRegionScope().accountRegionScope,
      logicalId: "TestResource",
      template: {
        DependsOn: ["CompleteDependency", "PendingDependency"],
      },
    });
    const resources = new Map<string, SimCfnResource>([
      ["CompleteDependency", completeDependency],
      ["PendingDependency", pendingDependency],
    ]);

    // When dependency status is checked before all dependencies are complete.
    const canCreateBefore = resource.canCreate(resources);

    pendingDependency.markCreateComplete();

    // Then creation becomes allowed only once every dependency is complete.
    assertIdentical(canCreateBefore, false);
    assertIdentical(resource.canCreate(resources), true);
  });

  it("marks creation status transitions explicitly", () => {
    // Given a Resource and two simulated backing objects.
    const simAws = new SimAws();
    const originalSimResource = { bucketName: "original-bucket" };
    const replacementSimResource = { bucketName: "replacement-bucket" };
    const createError = new Error("creation failed");
    const resource = new SimCfnResource({
      accountRegionScope: simAws.accountRegionScope().accountRegionScope,
      logicalId: "TestResource",
      template: {},
    });

    // When explicit creation status helpers are used.
    resource.markCreateInProgress();
    const inProgressStatus = resource.status;
    const inProgressDeployed = resource.deployed;
    const inProgressCreateComplete = resource.createComplete;

    resource.markCreateFailed(createError);
    const failedStatus = resource.status;
    const failedCreateComplete = resource.createComplete;
    const failedError = resource.error;

    resource.markCreateComplete(originalSimResource);
    const completeWithOriginal = resource.simResource;

    resource.markCreateComplete();
    const completeWithoutReplacement = resource.simResource;

    resource.markCreateComplete(replacementSimResource);
    const completeWithReplacement = resource.simResource;

    // Then each helper updates status, terminal flags, error and sim Resource
    // state consistently.
    assertIdentical(inProgressStatus, "CREATE_IN_PROGRESS");
    assertIdentical(inProgressDeployed, false);
    assertIdentical(inProgressCreateComplete, false);

    assertIdentical(failedStatus, "CREATE_FAILED");
    assertIdentical(failedCreateComplete, true);
    assertIdentical(failedError, createError);

    assertIdentical(completeWithOriginal, originalSimResource);
    assertIdentical(completeWithoutReplacement, originalSimResource);
    assertIdentical(completeWithReplacement, replacementSimResource);
    assertIdentical(resource.status, "CREATE_COMPLETE");
    assertIdentical(resource.deployed, true);
    assertIdentical(resource.createComplete, true);
    assertUndefined(resource.error);
  });

  it("creates the backing simulated Resource through an injected factory", async () => {
    // Given a Resource with an isolated factory injected for creation.
    const simAws = new SimAws();
    const createdSimResource = { bucketName: "created-bucket" };

    const cfnResourceFactory: SimCfnServiceResourceFactory = {
      async create(resourceTypeName): Promise<object> {
        await Promise.resolve();

        assertIdentical(resourceTypeName, "Bucket");

        return createdSimResource;
      },
    };

    const resource = new SimCfnResource({
      accountRegionScope: simAws.accountRegionScope().accountRegionScope,
      logicalId: "TestResource",
      template: {
        Type: "AWS::S3::Bucket",
      },
      cfnResourceFactory,
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map([["TestResource", resource]]),
    };

    // When the Resource is created.
    const createPromise = resource.create(context);

    assertIdentical(resource.status, "CREATE_IN_PROGRESS");

    await createPromise;

    // Then the injected factory result is recorded and the Resource completes.
    assertIdentical(resource.status, "CREATE_COMPLETE");
    assertIdentical(resource.simResource, createdSimResource);
    assertIdentical(resource.deployed, true);
    assertIdentical(resource.createComplete, true);
    assertUndefined(resource.error);
  });

  it("fails creation when Type is missing", async () => {
    // Given a Resource template without a Type field.
    const simAws = new SimAws();
    const resource = new SimCfnResource({
      accountRegionScope: simAws.accountRegionScope().accountRegionScope,
      logicalId: "TestResource",
      template: {},
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map([["TestResource", resource]]),
    };

    // When creation is attempted, then it rejects with a Resource-specific
    // missing Type error.
    const error = await assertThrowsErrorAsync(async () =>
      resource.create(context),
    );

    // Then the failure is recorded on the Resource.
    assertNonNullable(error);
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource TestResource is missing a Type",
    );
    assertIdentical(resource.status, "CREATE_FAILED");
    assertIdentical(resource.createComplete, true);
    assertIdentical(resource.error, error);
  });

  it("wraps non-Error creation failures", async () => {
    // Given an injected factory that rejects with a non-Error value.
    const simAws = new SimAws();
    const resource = new SimCfnResource({
      accountRegionScope: simAws.accountRegionScope().accountRegionScope,
      logicalId: "TestResource",
      template: {
        Type: "AWS::S3::Bucket",
      },
      cfnResourceFactory: {
        async create() {
          await Promise.resolve();

          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw "factory failed";
        },
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map([["TestResource", resource]]),
    };

    // When creation fails with a non-Error thrown value.
    const error = await assertThrowsErrorAsync(async () =>
      resource.create(context),
    );

    // Then the thrown value is wrapped as an Error and stored on the Resource.
    assertIdentical(
      error.message,
      "Sim CloudFormation Resource creation failed: factory failed",
    );
    assertIdentical(resource.status, "CREATE_FAILED");
    assertIdentical(resource.createComplete, true);
    assertIdentical(resource.error, error);
  });
});
