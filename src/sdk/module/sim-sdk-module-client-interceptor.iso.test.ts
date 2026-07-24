import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSdkModuleClientInterceptor } from "./sim-sdk-module-client-interceptor.js";

/**
 * A minimal SDK-shaped client class: send lives on the prototype, like the
 * smithy Client base class provides for real SDK v3 clients.
 */
class FakeSdkClient {
  constructor(readonly clientConfiguration?: { region?: string }) {}

  send(command: object): Promise<unknown> {
    return Promise.resolve({ realSend: command });
  }
}

/**
 * A minimal SDK-shaped Command class: no send method.
 */
class FakeSdkCommand {
  constructor(readonly input: object) {}
}

class FakeSdkError extends Error {}

const fakeSdkConstant = "fake-sdk-constant";

interface RecordedSend {
  readonly command: object;
  readonly client: unknown;
}

function makeInterceptor(defaultRegionName?: "eu-west-2"): {
  interceptor: SimSdkModuleClientInterceptor;
  sends: RecordedSend[];
} {
  const sends: RecordedSend[] = [];
  const interceptor = new SimSdkModuleClientInterceptor({
    sendHandler: (command, client) => {
      sends.push({ command, client });
      return Promise.resolve("sim-send-result");
    },
    defaultRegionName,
  });
  return { interceptor, sends };
}

function fakeModuleExports(): Record<string, unknown> {
  return {
    FakeSdkClient,
    FakeSdkCommand,
    FakeSdkError,
    fakeSdkConstant,
  };
}

describe("SimSdkModuleClientInterceptor", () => {
  it("send-patches instances of intercepted client classes", async () => {
    // Given a module whose client class export has been intercepted.
    const { interceptor, sends } = makeInterceptor();
    const intercepted = interceptor.interceptModule(fakeModuleExports()) as {
      FakeSdkClient: typeof FakeSdkClient;
    };

    // When a client is constructed from the intercepted module and sends a
    // command.
    const client = new intercepted.FakeSdkClient();
    const command = new FakeSdkCommand({ Bucket: "bucket" });
    const result = await client.send(command);

    // Then the send went to the simulated send handler with the command and
    // the sending client.
    assertIdentical(result, "sim-send-result");
    assertArrayLength(sends, 1);
    const recordedSend = sends[0];
    assertNonNullable(recordedSend);
    assertIdentical(recordedSend.command, command);
    assertIdentical(recordedSend.client, client);

    // And the patch is an own property on the instance, so the real class
    // prototype stays untouched for direct module users.
    assertTrue(Object.hasOwn(client, "send"));
    assertInstanceOf(client, FakeSdkClient);
    const directInstance = new FakeSdkClient();
    assertFalse(Object.hasOwn(directInstance, "send"));
    const directResult = (await directInstance.send(command)) as {
      realSend: object;
    };
    assertIdentical(directResult.realSend, command);
  });

  it("passes non-client exports through by identity", () => {
    // Given a module with command, error, and constant exports.
    const { interceptor } = makeInterceptor();

    // When the module is intercepted.
    const intercepted = interceptor.interceptModule(
      fakeModuleExports(),
    ) as Record<string, unknown>;

    // Then everything without a prototype send passes through unchanged.
    assertIdentical(intercepted["FakeSdkCommand"], FakeSdkCommand);
    assertIdentical(intercepted["FakeSdkError"], FakeSdkError);
    assertIdentical(intercepted["fakeSdkConstant"], fakeSdkConstant);
  });

  it("does not mutate the source module exports", () => {
    // Given a module exports object.
    const { interceptor } = makeInterceptor();
    const moduleExports = fakeModuleExports();

    // When the module is intercepted.
    const intercepted = interceptor.interceptModule(moduleExports) as Record<
      string,
      unknown
    >;

    // Then the source exports still expose the unwrapped client class, as the
    // host module registry caches that object process-wide.
    assertIdentical(moduleExports["FakeSdkClient"], FakeSdkClient);
    assertFalse(intercepted["FakeSdkClient"] === FakeSdkClient);
  });

  it("defaults the client region when none is configured", () => {
    // Given an interceptor with a default region, as the Lambda runtime
    // scope provides.
    const { interceptor } = makeInterceptor("eu-west-2");
    const intercepted = interceptor.interceptModule(fakeModuleExports()) as {
      FakeSdkClient: typeof FakeSdkClient;
    };

    // When clients are constructed without a region, with an explicit
    // region, and with no configuration at all.
    const unconfigured = new intercepted.FakeSdkClient();
    const noRegion = new intercepted.FakeSdkClient({});
    const explicitRegion = new intercepted.FakeSdkClient({
      region: "us-east-1",
    });

    // Then the default region is injected only when none was configured.
    assertIdentical(unconfigured.clientConfiguration?.region, "eu-west-2");
    assertIdentical(noRegion.clientConfiguration?.region, "eu-west-2");
    assertIdentical(explicitRegion.clientConfiguration?.region, "us-east-1");
  });

  it("leaves constructor arguments alone without a default region", () => {
    // Given an interceptor without a default region.
    const { interceptor } = makeInterceptor();
    const intercepted = interceptor.interceptModule(fakeModuleExports()) as {
      FakeSdkClient: typeof FakeSdkClient;
    };

    // When a client is constructed without configuration.
    const client = new intercepted.FakeSdkClient();

    // Then no configuration is injected.
    assertUndefined(client.clientConfiguration);
  });

  it("leaves non-object configuration arguments alone", () => {
    // Given an intercepted client class and a default region.
    const { interceptor } = makeInterceptor("eu-west-2");
    const intercepted = interceptor.interceptModule({
      FakeSdkClient,
    }) as { FakeSdkClient: new (configuration: unknown) => FakeSdkClient };

    // When a client is constructed with a non-object configuration value.
    const client = new intercepted.FakeSdkClient("not-a-configuration");

    // Then the argument passes through unchanged for the real class to
    // handle.
    assertIdentical(
      client.clientConfiguration as unknown as string,
      "not-a-configuration",
    );
  });
});
