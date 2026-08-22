# Simulated Bedrock

Simulated Bedrock answers model invocations from responses declared against a prompt or a model. A
test says what the model says, and no model runs.

Bedrock-specific types are imported from the `@kensio/yulin/bedrock` subpath.

## Answering a conversation

`Converse` answers with the response declared for the prompt it carries. The prompt is the text of
the last user message.

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

A conversation with several turns matches on its last user message, so a rule keeps matching as the
conversation grows.

## Answering every call to one model

`onModel` covers every invocation of a model that no prompt rule matched first. This is the rule for
a test that cares about the code around the call rather than about one exchange.

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

`byDefault` covers everything else again. An invocation matching no rule at all answers with a
built-in line of text that says it is simulated.

## Answering with a tool call

A declared response carries content blocks as they were written, so a tool call reaches the code
that handles one. The response stops for `tool_use` unless the declaration names another reason.

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

`ConverseStream` answers from the same rules, and sends the response as the events real Bedrock
sends. Declaring `chunks` says where the deltas fall.

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

The events arrive in the order real Bedrock sends them. `messageStart`, then one
`contentBlockDelta` per chunk, then `contentBlockStop`, `messageStop` carrying the stop reason, and
`metadata` carrying the token counts. A tool call adds a `contentBlockStart` before its delta,
carrying the tool use id and name.

The same declaration serves both APIs. `Converse` answers with the chunks joined, and a response
declared as `text` streams as a single delta. A stream is readable once, and reading it again
raises.

`InvokeModelWithResponseStream` streams the declared body as a single `chunk`:

```typescript
for await (const event of answered.body) {
  accumulated += new TextDecoder().decode(event.chunk?.bytes);
}
```

## Invoking a model directly

`InvokeModel` answers with the body declared for the request, serialized as JSON. The body is the
shape the model behind the id uses, which is why there is no built-in default for it.

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

An `InvokeModel` request matches a prompt rule on its request body decoded as UTF-8. A model rule is
usually the one to reach for.

## Reporting token counts

`usage` comes from the declaration, and a response that declares none reports fixed counts.

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

An invocation authorizes `bedrock:InvokeModel` against the model it names. A base model id becomes a
foundation model ARN for the Region the call was made in, and an inference profile ARN or a
provisioned model ARN is authorized against as it was written.

## SDK interception

An intercepted `BedrockRuntimeClient` reaches the simulated Bedrock of the Account and Region the
client is configured for.

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
- Responses declared with `onPrompt`, `onModel` and `byDefault`. A prompt rule wins, then a model
  rule, then the default.
- A declared response carries `text`, `chunks` or `content` blocks for `Converse`, a `body` for
  `InvokeModel`, and optionally a `stopReason` and a `usage`.
- Streamed responses, with `chunks` deciding where the deltas fall and one declaration serving the
  streaming and non-streaming APIs alike.
- Tool calls, as a declared `toolUse` content block.
- IAM authorization of `bedrock:InvokeModel` against the foundation model, inference profile or
  provisioned model ARN the request names.
- Rules held per Account and Region, so two Regions answer the same prompt differently.

## Limitations

- No model runs. A response is whatever the matching rule declared, and the prompt is read only as
  a key to match on.
- Every event of a stream is ready as soon as the call returns. Real Bedrock sends them as the model
  generates them. No simulated clock advance separates them here.
- A response is split into deltas only where the declaration says so. Text declared any other way
  arrives in one delta. The split a real model streams comes from its own tokenizer.
- A streamed tool call sends its arguments in one delta. Real `ConverseStream` sends them as
  fragments of JSON to be concatenated. A tool call with no declared arguments sends `{}`.
- `InvokeModelWithResponseStream` sends the declared body as a single chunk. Real Bedrock sends a
  chunk per generated fragment, in the shape the model behind the id uses.
- A serialized Bedrock request is refused. Bedrock speaks REST-JSON, and the wire path answers only
  the AWS JSON protocol services. A function bundling its own SDK reaches Bedrock through module
  interception. S3 and every other non-JSON-protocol service are reached the same way.
- The Bedrock control plane is unsimulated. `ListFoundationModels`, guardrail management, inference
  profile management and provisioned throughput all belong to `BedrockClient`.
- Bedrock Agents and knowledge bases are unsimulated. `InvokeAgent`, `Retrieve` and
  `RetrieveAndGenerate` arrive on a client of their own.
- `ApplyGuardrail` is unsimulated, and a `guardrailConfig` or a `guardrailIdentifier` on an
  invocation is refused outright. Answering without the guardrail would make one look applied here
  and be applied in production.
- `system`, `inferenceConfig`, `toolConfig` and `additionalModelRequestFields` are accepted and
  decide nothing. `maxTokens` truncates no declared response, and a `toolConfig` naming no tools
  still gets a declared tool call.
- Token counts are fixed unless the declaration carries them. Counting them needs the tokenizer of
  the model the request names. Declare a `usage` where the code under test meters spend.
- `metrics.latencyMs` is always zero. No time passes during an invocation.
- A `Converse` with no messages is refused. Real Bedrock accepts one where the `modelId` names a
  prompt version from Prompt management, which is unsimulated.
- The model id goes unchecked. AWS publishes no enumerable table of model ids, so refusing one would
  be failing closed against Yulin's own gaps.
- `InvokeModel` has no built-in default response body, and an invocation matching a rule that
  declares none is refused. A response body is model-specific, and one family's shape served for
  every other one would parse into something the caller cannot read.
- An `InvokeModel` body that arrives as a stream or a Blob matches no prompt rule. Reading it would
  consume the caller's own request body, so such a request falls through to a model rule or to the
  default.
- A `Converse` call matching a response declared only as a body is refused for the same reason. It
  does not fall back to the default.
- There are no CloudFormation resource types for Bedrock, and Bedrock is absent from `serveSimAws`.
