import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimFirehoseDelivery } from "../delivery/sim-firehose-delivery.js";
import type { SimFirehoseDeliveryFailures } from "../delivery/sim-firehose-delivery-failures.js";
import {
  type SimFirehoseObjectDestination,
  SimFirehoseObjectWriter,
} from "../delivery/sim-firehose-object-writer.js";
import type { SimFirehoseRecordSource } from "../source/sim-firehose-record-source.js";
import type { SimFirehoseSourceFailures } from "../source/sim-firehose-source-failures.js";
import { SimFirehoseSourceReading } from "../source/read/sim-firehose-source-reading.js";
import type { SimFirehoseDeliveryStreamStore } from "../stream/sim-firehose-delivery-stream-store.js";
import { SimFirehoseAuthorizer } from "./authorize/sim-firehose-authorizer.js";
import { SimFirehosePutCommands } from "./record/sim-firehose-put-commands.js";
import { SimFirehoseDeliveryStreamAccess } from "./sim-firehose-delivery-stream-access.js";
import { SimFirehoseCreateDeliveryStream } from "./stream/sim-firehose-create-delivery-stream.js";
import { SimFirehoseStreamCommands } from "./stream/sim-firehose-stream-commands.js";

interface SimFirehoseCommandsProperties {
  readonly deliveryStreams: SimFirehoseDeliveryStreamStore;
  readonly failures: SimFirehoseDeliveryFailures;
  readonly sourceFailures: SimFirehoseSourceFailures;
  readonly s3: SimFirehoseObjectDestination;
  readonly kinesis: SimFirehoseRecordSource;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Every command handler one simulated Firehose scope delegates to.
 *
 * The wiring lives here rather than in the facade so that `SimFirehose` stays
 * what it is meant to be: state and delegation. Which handler shares which
 * collaborator is a fact about the handlers, not about the service object in
 * front of them.
 */
export class SimFirehoseCommands {
  public readonly creation: SimFirehoseCreateDeliveryStream;
  public readonly deliveryStreams: SimFirehoseStreamCommands;
  public readonly puts: SimFirehosePutCommands;

  constructor(properties: SimFirehoseCommandsProperties) {
    const { deliveryStreams, background, accountRegionScope } = properties;
    const access = new SimFirehoseDeliveryStreamAccess({
      deliveryStreams,
      authorizer: new SimFirehoseAuthorizer({ iam: properties.iam }),
      accountRegionScope,
    });
    const delivery = new SimFirehoseDelivery({
      background,
      writer: new SimFirehoseObjectWriter({
        s3: properties.s3,
        failures: properties.failures,
      }),
    });

    const sourceReading = new SimFirehoseSourceReading({
      records: properties.kinesis,
      failures: properties.sourceFailures,
      delivery,
      background,
    });

    this.creation = new SimFirehoseCreateDeliveryStream({
      deliveryStreams,
      access,
      accountRegionScope,
      background,
      sourceReading,
    });
    this.deliveryStreams = new SimFirehoseStreamCommands({
      deliveryStreams,
      access,
      delivery,
      sourceReading,
    });
    this.puts = new SimFirehosePutCommands({ access, delivery });
  }
}
