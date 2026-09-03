# Simulated Bedrock

Yulin answers Bedrock Runtime requests from response rules declared by the test. Model responses
come entirely from those rules.

Bedrock-specific types are imported from the `@kensio/yulin/bedrock` subpath.

## Answering a conversation

Declare a response with `onPrompt`, then call `converse`. The prompt is the text of the last user
message.

```typescript sim-bedrock-converse
/**
 * Declaring what a model answers one prompt with, and conversing with it.
 */

import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

simAws.bedrock().responses().onPrompt("Summarise entry 1042", {
  text: "Entry 1042 covers the tone sandhi rules.",
});

const answered = await simAws.bedrock().converse(
  new ConverseCommand({
    modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    messages: [{ role: "user", content: [{ text: "Summarise entry 1042" }] }],
  }),
);

console.log(answered.output.message.content.at(0)?.text);
// "Entry 1042 covers the tone sandhi rules."
console.log(answered.stopReason); // "end_turn"
```

A multi-turn conversation also matches its last user message.

## Answering every call to one model

Use `onModel` when every call to one model should receive the same response. Prompt rules take
precedence over model rules.

```typescript sim-bedrock-model-rule
/**
 * Declaring one answer for every call to a model.
 */

import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

simAws
  .bedrock()
  .responses()
  .onModel("amazon.nova-pro-v1:0", { text: "A short summary." });

const answered = await simAws.bedrock().converse(
  new ConverseCommand({
    modelId: "amazon.nova-pro-v1:0",
    messages: [{ role: "user", content: [{ text: "Anything at all" }] }],
  }),
);

console.log(answered.output.message.content.at(0)?.text); // "A short summary."
```

`byDefault` handles calls that match no prompt or model rule. With no matching declaration, Yulin
returns a built-in simulated response for `Converse`.

## Answering with a tool call

Declare a `toolUse` content block to test code that handles model tool calls. The default stop reason
for this response is `tool_use`.

```typescript sim-bedrock-tool-use
/**
 * Declaring a tool call for the code under test to handle.
 */

import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

simAws
  .bedrock()
  .responses()
  .onPrompt("What is in entry 1042?", {
    content: [
      {
        toolUse: {
          toolUseId: "tooluse-1",
          name: "lookUpEntry",
          input: { entryId: "1042" },
        },
      },
    ],
  });

const answered = await simAws.bedrock().converse(
  new ConverseCommand({
    modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    messages: [{ role: "user", content: [{ text: "What is in entry 1042?" }] }],
  }),
);

console.log(answered.stopReason); // "tool_use"
console.log(answered.output.message.content.at(0)?.toolUse?.name);
// "lookUpEntry"
```

## Streaming a conversation

`ConverseStream` uses the same rules as `Converse`. Declare `chunks` to control the text in each
stream event.

```typescript sim-bedrock-converse-stream
/**
 * Declaring a response in chunks and accumulating the stream.
 */

import { ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

simAws
  .bedrock()
  .responses()
  .onPrompt("Summarise entry 1042", {
    chunks: ["Entry 1042 covers ", "the tone sandhi rules."],
  });

const answered = await simAws.bedrock().converseStream(
  new ConverseStreamCommand({
    modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    messages: [{ role: "user", content: [{ text: "Summarise entry 1042" }] }],
  }),
);

let accumulated = "";

for await (const event of answered.stream) {
  accumulated += event.contentBlockDelta?.delta.text ?? "";
}

console.log(accumulated); // "Entry 1042 covers the tone sandhi rules."
```

The stream contains `messageStart`, content block events, `messageStop` and `metadata`. Tool calls
also include `contentBlockStart` with the tool use ID and name.

The same declaration serves both APIs. `Converse` joins declared chunks. Plain `text` becomes one
stream delta. A stream can be read once.

`InvokeModelWithResponseStream` streams the declared body as a single `chunk`:

```typescript
for await (const event of answered.body) {
  accumulated += new TextDecoder().decode(event.chunk?.bytes);
}
```

## Invoking a model directly

`InvokeModel` returns the declared `body` as JSON. The response shape depends on the model, so this
operation has no built-in body.

```typescript sim-bedrock-invoke-model
/**
 * Declaring a model-specific response body and invoking the model.
 */

import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

simAws
  .bedrock()
  .responses()
  .onModel("amazon.titan-text-express-v1", {
    body: { results: [{ outputText: "Entry 1042 covers tone sandhi." }] },
  });

const answered = await simAws.bedrock().invokeModel(
  new InvokeModelCommand({
    modelId: "amazon.titan-text-express-v1",
    body: JSON.stringify({ inputText: "Summarise entry 1042" }),
  }),
);

console.log(JSON.parse(new TextDecoder().decode(answered.body)));
// { results: [ { outputText: "Entry 1042 covers tone sandhi." } ] }
```

Prompt rules match the UTF-8 request body. Model rules are usually simpler for this API.

## Reporting token counts

Set `usage` on a response rule to control token counts. Yulin uses fixed counts when it is omitted.

```typescript sim-bedrock-usage
/**
 * Declaring what a response cost, for code that meters token spend.
 */

import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

simAws
  .bedrock()
  .responses()
  .byDefault({
    text: "A short summary.",
    usage: { inputTokens: 1400, outputTokens: 220 },
  });

const answered = await simAws.bedrock().converse(
  new ConverseCommand({
    modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    messages: [{ role: "user", content: [{ text: "Summarise entry 1042" }] }],
  }),
);

console.log(answered.usage.totalTokens); // 1620
```

## Authorizing an invocation

Every invocation authorizes `bedrock:InvokeModel` against the requested model. A base model ID is
converted to a foundation model ARN in the request Region. Model ARNs are used unchanged.

## SDK interception

Intercept a `BedrockRuntimeClient` when application code constructs the client itself. Client
credentials and Region select the simulated scope.

```typescript sim-bedrock-sdk-interception
/**
 * Answering production code that holds its own Bedrock Runtime client.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

import { SimSdk } from "@kensio/yulin/sdk";

const simSdk = new SimSdk();
simSdk.intercept(BedrockRuntimeClient);

simSdk.simAws
  .account()
  .region("eu-west-2")
  .bedrock()
  .responses()
  .byDefault({ text: "Entry 1042 covers the tone sandhi rules." });

const client = new BedrockRuntimeClient({ region: "eu-west-2" });

const answered = await client.send(
  new ConverseCommand({
    modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    messages: [{ role: "user", content: [{ text: "Summarise entry 1042" }] }],
  }),
);

console.log(answered.output?.message?.content?.at(0)?.text);
// "Entry 1042 covers the tone sandhi rules."

client.destroy();
simSdk.restoreAll();
```

## Available functionality

- `Converse`, `ConverseStream`, `InvokeModel` and `InvokeModelWithResponseStream`, through
  `simAws.bedrock()` and through an intercepted `BedrockRuntimeClient`.
- Responses declared with `onPrompt`, `onModel` and `byDefault`, in that precedence order.
- A declared response carries `text`, `chunks` or `content` blocks for `Converse`, a `body` for
  `InvokeModel`, and optionally a `stopReason` and a `usage`.
- Streamed responses with caller-controlled chunks.
- Tool calls, as a declared `toolUse` content block.
- IAM authorization of `bedrock:InvokeModel` against the foundation model, inference profile or
  provisioned model ARN the request names.
- Rules scoped by account and Region.

## Limitations

- No model runs. Yulin returns the matching declared response.
- Every event of a stream is ready as soon as the call returns. Real Bedrock sends them as the model
  generates them. No simulated clock advance separates them here.
- A response is split only at declared chunk boundaries. Other text arrives in one delta.
- A streamed tool call sends its arguments in one delta. Real `ConverseStream` sends them as
  fragments of JSON to be concatenated. A tool call with no declared arguments sends `{}`.
- `InvokeModelWithResponseStream` sends the declared body as a single chunk. Real Bedrock sends a
  chunk per generated fragment, in the shape the model behind the id uses.
- Serialized Bedrock requests are unsupported. Use SDK interception.
- The Bedrock control plane is unsimulated. `ListFoundationModels`, guardrail management, inference
  profile management and provisioned throughput all belong to `BedrockClient`.
- Bedrock Agents and knowledge bases are unsimulated. `InvokeAgent`, `Retrieve` and
  `RetrieveAndGenerate` arrive on a client of their own.
- `ApplyGuardrail` is unsimulated, and a `guardrailConfig` or a `guardrailIdentifier` on an
  invocation is refused outright. Answering without the guardrail would make one look applied here
  and be applied in production.
- `system`, `inferenceConfig`, `toolConfig` and `additionalModelRequestFields` are accepted and have
  no effect. `maxTokens` truncates no declared response, and a `toolConfig` naming no tools
  still gets a declared tool call.
- Token counts are fixed unless the declaration carries them. Counting them needs the tokenizer of
  the model the request names. Declare a `usage` where the code under test meters spend.
- `metrics.latencyMs` is always zero. No time passes during an invocation.
- A `Converse` with no messages is refused. Real Bedrock accepts one where the `modelId` names a
  prompt version from Prompt management, which is unsimulated.
- Any model ID is accepted.
- `InvokeModel` has no built-in default response body, and an invocation matching a rule that
  declares none is refused. A response body is model-specific, and one family's shape served for
  every other one would parse into something the caller cannot read.
- An `InvokeModel` body supplied as a stream or `Blob` cannot match a prompt rule. It may still match
  a model or default rule.
- A `Converse` call matching a response declared only as a body is refused for the same reason. The
  matching rule prevents the default rule from being selected.
- There are no CloudFormation resource types for Bedrock, and Bedrock is absent from `serveSimAws`.
