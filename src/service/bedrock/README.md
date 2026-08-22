# Simulated Bedrock implementation

This directory contains the simulated Bedrock implementation. Two invocations are simulated,
`Converse` and `InvokeModel`, each answered from a response a test declared.

The guiding decision here is that no model runs. What matters about a Bedrock call is the answer,
and the simulation reads the prompt only as a key to match on. Simulated Rekognition
answers a detection the same way, without looking at an image. Everything else in this directory
makes the parts around that answer behave the way AWS does. The request checking, the IAM decision
and the response the SDK hands back are all real.

## Entry points

- `sim-bedrock.ts` is the service facade for one account/region scope.
- `index.ts` exports the public Bedrock simulator API for `@kensio/yulin/bedrock`.

`SimBedrock` owns one `SimBedrockResponses`, which both invocation handlers answer from. Rekognition
groups its rules per operation, because a moderation result and a face are different shapes.
Bedrock's two operations reach the same exchange through two request shapes. One rule set covers
both, and a test declaring a response gets it whichever API the code under test calls.

The service is scoped to an account and region because its rules are. An invocation made in one
Region is answered by the rules registered in that Region, as a real Bedrock endpoint answers for
the Region it belongs to.

## The rule mechanism

`response/sim-bedrock-responses.ts` is the whole of it. There is one kind of rule and one order
between them. An exact prompt wins, then an exact model id, then the default. That ordering is
`SimDeclaredResultRules`, which simulated Rekognition and simulated Personalize both match with.

Rules name no resource. Simulated Personalize hangs its rules off a campaign, because a campaign is
what a runtime call names and what a test creates first. A foundation model was there before the
account was. A Bedrock rule hangs off the service itself.

Matching is exact, with no pattern syntax, for the reason it is exact in Rekognition. A partial
match forces a specificity rule, and a specificity rule is where a surprising answer comes from.

The prompt of a `Converse` request is the text of its last user message, resolved in
`command/converse/sim-bedrock-converse-prompt.ts`. Earlier turns are the conversation the model is
answering in. A rule keyed on the whole history would stop matching as soon as the conversation grew
by one exchange, which is the case a multi-turn test is about.

The prompt of an `InvokeModel` request is its body decoded as UTF-8. The body is the whole request in
the shape the model behind the id expects, and real Bedrock treats it as opaque. So does this. A test matching one usually wants a model rule instead, and the tier exists
because the body is the only thing an `InvokeModel` request carries that identifies the exchange.

## The response model

`response/sim-bedrock-response-declaration.ts` holds the declared shape alone.
`response/sim-bedrock-declared-content.ts` and `response/sim-bedrock-declared-usage.ts` are the
checks over it, and `response/sim-bedrock-resolved-response.ts` is one resolved declaration. The
checks sit apart from the class because holding all three in one file scores over the FTA threshold.

A declaration is resolved when the rule is registered. A content block carrying both text and a tool
use, a response carrying both `text` and `content`, and a negative token count are all refused where
they were written.

What a response can answer is resolved per call, because which operation reaches a rule is only
known then. A `Converse` call reaching a declaration that carries a body alone is a declaration
error. Answering it with the built-in default would leave a test reading the default text as the
model's own answer.

`response/sim-bedrock-response-defaults.ts` holds the built-in default. It is a single line of text
saying what it is. A default that read like a real model answer would be asserted on by a test that
meant to declare one, and the assertion would pass for the wrong reason.

There is no default response body. A body is whatever shape the model behind the id uses, and one
family's shape served for every other family would parse into something the caller cannot read. An `InvokeModel` call
with no body declared for it is refused, naming the rule it reached.

A response holding a tool use stops for `tool_use` unless the declaration named a reason of its own.
Real Bedrock reports the same reason for the same response. Token counts are fixed, because counting
them needs the tokenizer of the model the request names.

## Authorization

`command/authorize/sim-bedrock-authorizer.ts` authorizes against the model, and the resource is
required. Every invocation names a model, and a policy allowing one foundation model and denying
another is the policy worth being able to test.

`model/sim-bedrock-model-arn.ts` turns a `modelId` into that resource. A base model id names a
foundation model, which belongs to no account and carries an empty account field in its ARN. An
inference profile, a provisioned model and a prompt version all arrive as ARNs already, and are
authorized against as they were written.

A denial is Bedrock's own `AccessDeniedException` with a 403 status. It follows the
`SimS3AccessDenied` precedent over the shared IAM error, since the error name and status are part of
what a caller has to handle.

Both operations authorize `bedrock:InvokeModel`. Real Bedrock has no `bedrock:Converse` action to
grant.

The order in each handler is Rekognition's. The request is checked first, so a malformed one fails
the same way whatever the caller is allowed to do. The declared response is read last. A caller with no permission is told about the permission.

## Refusals

`command/sim-bedrock-unsimulated-input.ts` refuses the request inputs this simulation leaves
unmodelled. It works from the small accepted set. An option nobody thought about is refused, where
an option missing from a denylist would be dropped.

`guardrailConfig` is the one that matters, along with `guardrailIdentifier` on `InvokeModel`. A
request naming a guardrail would be answered here without it and filtered for real in production,
which is the failure that looks like a pass.

`system`, `inferenceConfig`, `toolConfig` and `additionalModelRequestFields` are accepted and have
no effect. They decide what a model generates, and no model generates anything here. Refusing them
would refuse most production code on its first call. Which tools the model calls is decided by the
declared response, which either carries a tool use block or leaves one out.

The model id goes unresolved. Bedrock publishes no enumerable table of model ids, and a
model this simulation refused to recognise would be a model Yulin decided did not exist. That is the
reasoning that leaves simulated Rekognition without a label ontology.

## Testing

Tests are colocated with the code they exercise. `command/sim-bedrock-iam.iso.test.ts` and
`command/sim-bedrock-validation.iso.test.ts` sit above the two command directories, because each
covers both operations.
