import { simLambdaDynamoDbStreamRecordTimes } from "./sim-lambda-stream-record-times.js";
import { processSimLambdaStreamBatch } from "./sim-lambda-stream-batch-processing.js";
import { simLambdaEventSourceFunction } from "./sim-lambda-event-source-function.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import type { SimLambdaDynamoDbPolledStream } from "./sim-lambda-dynamodb-polled-stream.js";
import type { SimLambdaDynamoDbStreamDelivery } from "./sim-lambda-dynamodb-stream-delivery.js";
import type { SimLambdaStreamProgress } from "./sim-lambda-stream-progress.js";
interface DynamoDbStreamPollingProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly mapping: SimLambdaEventSourceMapping;
  readonly stream: SimLambdaDynamoDbPolledStream;
  readonly delivery: SimLambdaDynamoDbStreamDelivery;
  readonly progress: SimLambdaStreamProgress;
}
/** Read and process DynamoDB batches as the function execution role. */
export class SimLambdaDynamoDbStreamPolling {
  constructor(private readonly properties: DynamoDbStreamPollingProperties) {}
  async poll(stopped: boolean): Promise<void> {
    const simFunction = simLambdaEventSourceFunction(
      this.properties.functions,
      this.properties.mapping,
      stopped,
    );

    if (simFunction === undefined) {
      return;
    }

    const { progress, stream, mapping, delivery } = this.properties;
    // Reading is done as the function's execution role, as on real Lambda, so
    // simulated IAM decides whether this mapping may read its stream.
    const batch = await stream.read(
      simFunction.roleArn,
      progress.position,
      progress.batchSizeWithin(mapping.batchSize),
    );

    await processSimLambdaStreamBatch({
      batch,
      progress,
      simFunction,
      times: simLambdaDynamoDbStreamRecordTimes,
      deliver: async (records) => await delivery.to(simFunction, records),
    });
  }
}
