import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimKinesisStreamStore } from "../stream/sim-kinesis-stream-store.js";
import { SimKinesisAuthorizer } from "./authorize/sim-kinesis-authorizer.js";
import { SimKinesisPutCommands } from "./record/sim-kinesis-put-commands.js";
import { SimKinesisReadCommands } from "./read/sim-kinesis-read-commands.js";
import { SimKinesisCreateStream } from "./stream/sim-kinesis-create-stream.js";
import { SimKinesisStreamCommands } from "./stream/sim-kinesis-stream-commands.js";
import { SimKinesisStreamAccess } from "./sim-kinesis-stream-access.js";

interface SimKinesisCommandsProperties {
  readonly streams: SimKinesisStreamStore;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Every command handler one simulated Kinesis scope delegates to.
 *
 * The wiring lives here rather than in the facade so that `SimKinesis` stays
 * what it is meant to be: state and delegation. Which handler shares which
 * collaborator is a fact about the handlers, not about the service object in
 * front of them.
 */
export class SimKinesisCommands {
  public readonly streamCreation: SimKinesisCreateStream;
  public readonly streams: SimKinesisStreamCommands;
  public readonly puts: SimKinesisPutCommands;
  public readonly reads: SimKinesisReadCommands;

  constructor(properties: SimKinesisCommandsProperties) {
    const { streams, background, accountRegionScope } = properties;
    const access = new SimKinesisStreamAccess({
      streams,
      authorizer: new SimKinesisAuthorizer({ iam: properties.iam }),
      accountRegionScope,
    });

    this.streamCreation = new SimKinesisCreateStream({
      streams,
      access,
      accountRegionScope,
      background,
    });
    this.streams = new SimKinesisStreamCommands({ streams, access });
    this.puts = new SimKinesisPutCommands({ access, background });
    this.reads = new SimKinesisReadCommands({ streams, access, background });
  }
}
