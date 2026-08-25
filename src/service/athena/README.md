# Simulated Athena implementation

This directory contains the simulated Athena implementation. Two resources are simulated,
workgroups and named queries, both readable through the SDK and both deployable from a template.

The guiding decision is that no query runs. Athena's own value is in the query engine, and a query
engine over Parquet and JSON objects in S3 is a different order of magnitude from the rest of this.
The two resources are still worth holding without one. A workgroup is where the cost guardrail and
the results location are configured, and a named query is the SQL somebody saved. A stack can prove
it set both.

That divergence is the one to be honest about. Simulated Athena accepts a query real Athena would
reject, because the SQL goes unread. `docs/services/athena/README.md` says so in its Limitations
list, and running a query is [issue 992](https://github.com/KensioSoftware/yulin/issues/992).

## Entry points

- `sim-athena.ts` is the service facade for one account/region scope.
- `index.ts` exports the public Athena simulator API for `@kensio/yulin/athena`.

`SimAthena` is state and delegation. Its two stores are `SimAthenaWorkGroupStore` and
`SimAthenaNamedQueryStore`, and every command handler is wired in `command/sim-athena-commands.ts`
so the facade stays out of it.

Reads are held apart from writes for each resource, making four handlers. The two have different
collaborators. A write needs the clock and the rules about what may change, and a read
needs the shape a response comes back in. Each rule a write applies then sits in a file of its own
beside the handler, `sim-athena-work-group-creation.ts`, `-update.ts` and `-deletion.ts`. A create,
an update and a delete share only the workgroup they name.

The service is self-contained, and `SimAwsSelfContainedServiceBuilder` builds it for that reason.
Writing to a Bucket and reading a catalog both belong to a running query. That is where the other
services would come in.

## The primary workgroup

Every scope is constructed holding `primary`, which real Athena makes with the account. That is what
lets `CreateNamedQuery` and `ListNamedQueries` work before a workgroup is created, and it is why
`SimAthena`'s constructor puts one in the store before wiring the commands.

## Two stores, keyed differently

A workgroup is keyed by name, because that is what every command names one by. A named query is
keyed by id, because Athena lets two named queries share a name and hands back a generated id from
`CreateNamedQuery`. `inWorkGroup` is how a listing finds one. A named query against a workgroup that
is absent is refused for the same reason, since storing it would leave it unreachable.

## Configuration is held immutably

`SimAthenaWorkGroup` and `SimAthenaWorkGroupConfiguration` are replaced on every change. A workgroup
a caller is already holding then stays as it was. `UpdateWorkGroup` merges field by field, as real
Athena does, and each clearable field has its own removal flag. The merge lives on the configuration
itself, keeping the update rules next to the fields they are about.

`SimAthenaResultConfiguration.isEmpty` handles the update that removed everything. A workgroup left
with no results location reports no result configuration at all.

## The CloudFormation layer

`cfn/` follows the shape the other services use. `SimAthenaCfnResourceFactory` dispatches on the
resource type name without its prefix, the form the CloudFormation engine passes in. Both creators
go through the ordinary SDK commands, so a workgroup a template deployed is the same thing an SDK
caller would have got, down to the refusals.

`sim-cfn-athena-resource-error.ts` is why a refusal fails the Resource. Sim CloudFormation reads an
error saying a Resource is unsupported as one to record and step over, and a stepped-over workgroup
would leave the stack looking deployed with its cost guardrail never configured.

Property handling splits the other way. `SimCfnAthenaWorkGroupPropertyRules` records anything the
simulation has no answer for on the Resource's `ignoredProperties` and lets the workgroup deploy
without it. A template carrying an execution role or a tag still gets its cutoff. Refusals are kept
for a property of the wrong type and for a resource the simulation could not create.

`sim-cfn-athena-property-values.ts` reads nested values. It takes a numeric or `"true"`/`"false"`
string as well as the real type, because a template parameter arrives as a string even where the
property it feeds is a number.

The `Ref` and `Fn::GetAtt` adapters live under
`src/service/cloudformation/resource/cfn/athena/`, beside the other services' adapters, as the
engine's own convention has them.
