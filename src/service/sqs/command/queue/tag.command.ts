import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

export interface SimTagQueueCommand {
  readonly input: SimTagQueueCommandInput;
}

export interface SimTagQueueCommandInput {
  readonly QueueUrl?: string | undefined;
  readonly Tags?: Readonly<Record<string, string>> | undefined;
}

export interface SimTagQueueCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

export interface SimUntagQueueCommand {
  readonly input: SimUntagQueueCommandInput;
}

export interface SimUntagQueueCommandInput {
  readonly QueueUrl?: string | undefined;
  readonly TagKeys?: readonly string[] | undefined;
}

export interface SimUntagQueueCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

export interface SimListQueueTagsCommand {
  readonly input: SimListQueueTagsCommandInput;
}

export interface SimListQueueTagsCommandInput {
  readonly QueueUrl?: string | undefined;
}

export interface SimListQueueTagsCommandOutput {
  readonly Tags?: Record<string, string> | undefined;
  readonly $metadata: SimResponseMetadata;
}
