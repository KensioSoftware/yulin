# Simulated Route53

Yulin simulates Amazon Route 53 hosted zones, records and DNSSEC configuration for tests and local
development. You can manage them through the AWS SDK or deploy them from CloudFormation and CDK
templates. When Yulin serves the simulation on localhost, Route 53 records can route local hostnames
to simulated services such as CloudFront distributions and S3 bucket websites.

Use Route 53 through `SimAws` when it should share state with other services. Use `SimRoute53`
directly when you need an isolated Route 53 simulation.

## Basic Hosted Zone usage

Create a simulated AWS environment, get simulated Route53, and create a Hosted Zone.

```typescript sim-route53-hosted-zone
/**
 * Creating a simulated Route53 Hosted Zone.
 */

import {
  CreateHostedZoneCommand,
  GetHostedZoneCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const route53 = simAws.route53();

const hostedZoneCreation = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "example-test-zone",
    HostedZoneConfig: {
      Comment: "Example local test zone",
      PrivateZone: false,
    },
  }),
);

const hostedZoneId = hostedZoneCreation.HostedZone!.Id!;

await simAws.backgroundTasksComplete();

const hostedZoneOut = await route53.getHostedZone(
  new GetHostedZoneCommand({
    Id: hostedZoneId,
  }),
);

console.log(hostedZoneOut.HostedZone?.Name);
console.log(hostedZoneOut.HostedZone?.ResourceRecordSetCount);
```

Hosted Zone names are normalised with a trailing dot in Route53-style outputs, so `example.test`
becomes `example.test.`.

Hosted zone creation moves the zone to `INSYNC` in a background task. Call
`await simAws.backgroundTasksComplete()` before asserting on the final state.

Hosted Zone IDs are accepted in any real Route53 shape, being a `Z` prefix followed by uppercase
alphanumerics, up to 32 characters. A real Hosted Zone ID copied out of an AWS account, such as
`Z2FDTNDATAQYW2`, can therefore be used in your test setup. An ID with no matching Hosted Zone gives
`NoSuchHostedZone`, while a malformed one gives `InvalidInput`. Commands also accept the
`/hostedzone/Z...` form as well as the bare ID.

## Registering a Hosted Zone with a chosen ID

`CreateHostedZoneCommand` allocates the hosted zone ID. When a synthesized template already contains
an ID, register that hosted zone during test setup instead.

For example, `HostedZone.fromLookup` writes the resolved hosted zone ID into the synthesized
template. Registering that ID before deployment lets its `AWS::Route53::RecordSet` resources deploy
without changing the template.

```typescript sim-route53-register-hosted-zone
/**
 * Registering a simulated Route53 Hosted Zone with a chosen Hosted Zone ID.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const route53 = simAws.route53();

// The Hosted Zone ID a CDK HostedZone.fromLookup baked into the template.
route53.registerHostedZone({
  id: "Z0123456789ABCDEFGHIJ",
  name: "example.test",
});

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "site-stack",
  template: {
    Resources: {
      SiteRecord: {
        Type: "AWS::Route53::RecordSet",
        Properties: {
          HostedZoneId: "Z0123456789ABCDEFGHIJ",
          Name: "www.example.test",
          Type: "A",
          TTL: "300",
          ResourceRecords: ["192.0.2.10"],
        },
      },
    },
  },
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

console.log(stack.getResource("SiteRecord")?.status);
```

A registered Hosted Zone behaves like any other. It answers `GetHostedZoneCommand`,
`ListHostedZonesByNameCommand` and `ChangeResourceRecordSetsCommand`, its records resolve through
local hostname routing and simulated DNS, and it is `INSYNC` straight away, having been described as
already existing rather than created.

`registerHostedZone` takes the same optional `config` as `CreateHostedZoneCommand`, and accepts the
`/hostedzone/Z...` form of the ID. An ID that another Hosted Zone already holds is refused with
`HostedZoneAlreadyExists`, and one that is no Route53 Hosted Zone ID at all with `InvalidInput`.

### A zone a template only names

Registering the zone first is optional. An `AWS::Route53::RecordSet` naming a `HostedZoneId` that no
Hosted Zone holds gets one registered under that ID as the record is created. A template built with
`HostedZone.fromLookup` therefore deploys without being told separately about a zone it already
describes.

The template carries the zone's ID and no name, so the name is inferred from the records. The first
record to name the zone names it, and a record above that name widens it. A stack holding
`example.test` and `www.example.test` ends up with a zone called `example.test`. A stack holding only
`www.example.test` ends up with a zone called `www.example.test`.

Register the zone yourself when a test depends on its name, such as one listing zones by name, or
when its name is a suffix of no record the stack holds. A registered zone keeps the name it was
given, and its records are stored under the name you chose.

### A lookup that never resolved

`HostedZone.fromLookup` needs credentials for the account holding the zone, or a `cdk.context.json`
holding a previous lookup's answer. With neither, CDK synthesizes the literal `DUMMY` as the Hosted
Zone ID and writes it into every `AWS::Route53::RecordSet` in the template. Deploying that template
gives `InvalidInput`, naming `DUMMY` as the stand-in and pointing back at the synth.

Run `cdk synth` with credentials for that account, or commit the `cdk.context.json` a resolved
lookup writes. Either one puts the real Hosted Zone ID in the template, and the zone is then
registered on demand like any other looked-up zone.

## Creating records

Use `ChangeResourceRecordSetsCommand` to add records to a Hosted Zone.

```typescript sim-route53-create-record
/**
 * Creating a simulated Route53 record.
 */

import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const route53 = simAws.route53();

const hostedZoneCreation = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "record-zone",
  }),
);

const hostedZoneId = hostedZoneCreation.HostedZone!.Id!;

await simAws.backgroundTasksComplete();

await route53.changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Comment: "Create web record",
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "www.example.test",
            Type: "A",
            TTL: 300,
            ResourceRecords: [{ Value: "192.0.2.1" }],
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();
```

Record changes are applied through background tasks. The command returns a `ChangeInfo` with a
pending or synced status, and the record is available after the scheduled work has completed.

## Upserting and deleting records

`UPSERT` replaces an existing record with the same name and type. `DELETE` removes the matching
record. Deleting a missing record is a no-op.

```typescript sim-route53-upsert-delete-record
/**
 * Upserting and deleting simulated Route53 records.
 */

import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const route53 = simAws.route53();

const hostedZoneCreation = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "upsert-delete-zone",
  }),
);

const hostedZoneId = hostedZoneCreation.HostedZone!.Id!;

await simAws.backgroundTasksComplete();

await route53.changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Changes: [
        {
          Action: "UPSERT",
          ResourceRecordSet: {
            Name: "www.example.test",
            Type: "A",
            TTL: 60,
            ResourceRecords: [{ Value: "192.0.2.2" }],
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();

await route53.changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Changes: [
        {
          Action: "DELETE",
          ResourceRecordSet: {
            Name: "www.example.test",
            Type: "A",
            ResourceRecords: [{ Value: "192.0.2.2" }],
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();
```

## Alias records

Alias records store the alias target DNS name as the simulated record value. This is useful when a
Route53 record should point to another simulated service hostname, such as a CloudFront distribution
or a load balancer. See [What a name can resolve to](#what-a-name-can-resolve-to) for the hostnames a
record can point at.

```typescript sim-route53-alias-record
/**
 * Creating a simulated Route53 alias record.
 */

import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const route53 = simAws.route53();

const hostedZoneCreation = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "alias-zone",
  }),
);

const hostedZoneId = hostedZoneCreation.HostedZone!.Id!;

await simAws.backgroundTasksComplete();

await route53.changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "app.example.test",
            Type: "A",
            AliasTarget: {
              HostedZoneId: "Z2FDTNDATAQYW2",
              DNSName: "d111111abcdef8.cloudfront.net.",
              EvaluateTargetHealth: false,
            },
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();
```

The stored alias value is normalized without the trailing dot.

## Record types

Sim Route53 stores ten record types: `A`, `AAAA`, `CAA`, `CNAME`, `MX`, `NS`, `PTR`, `SOA`, `SRV` and
`TXT`. All ten can be created through `ChangeResourceRecordSetsCommand`, read back through
`ListResourceRecordSetsCommand`, and declared as an `AWS::Route53::RecordSet`. A zone that models a
real one (mail records, certificate pinning, a service record) deploys as it stands.

A type outside that list is refused by `ChangeResourceRecordSetsCommand`, because the call asked for
a record the simulator cannot keep. A template declaring one is treated more gently. The
`AWS::Route53::RecordSet` is skipped and the rest of the stack deploys. See
[unsupported record types in a template](#unsupported-record-types-in-a-template).

Simulated DNS answers queries for six of them, being `A`, `AAAA`, `CNAME`, `TXT`, `NS` and `SOA`.
`MX`, `SRV`, `CAA` and `PTR` are stored for a test to assert the presence and value of, and a DNS
query for one is answered as no data. See [What is answered](#what-is-answered).

Values of those four are stored exactly as written, along with `TXT`. An `MX` preference number and
an `SRV` priority are kept whole, so what you assert on is the string your stack declared. Values of
the other types are hostnames or addresses, and are normalized like DNS names so they compare
consistently.

```typescript sim-route53-mail-records
/**
 * Creating simulated Route53 records a resolver never answers for.
 */

import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
  ListResourceRecordSetsCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const route53 = simAws.route53();

const hostedZoneCreation = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "mail-zone",
  }),
);

const hostedZoneId = hostedZoneCreation.HostedZone!.Id!;

await simAws.backgroundTasksComplete();

await route53.changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "example.test",
            Type: "MX",
            TTL: 3600,
            ResourceRecords: [
              { Value: "10 mx1.example.test." },
              { Value: "20 mx2.example.test." },
            ],
          },
        },
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "example.test",
            Type: "CAA",
            TTL: 300,
            ResourceRecords: [{ Value: '0 issue "letsencrypt.org"' }],
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();

const listOutput = await route53.listResourceRecordSets(
  new ListResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
  }),
);

const mailRecord = listOutput.ResourceRecordSets?.find(
  (recordSet) => recordSet.Type === "MX",
);

// [ '10 mx1.example.test.', '20 mx2.example.test.' ]
console.log(mailRecord?.ResourceRecords?.map((record) => record.Value));
```

## Listing Hosted Zones by name

Use `ListHostedZonesByNameCommand` to inspect zones in sorted Route53 order.

```typescript sim-route53-list-hosted-zones-by-name
/**
 * Listing simulated Route53 Hosted Zones by name.
 */

import {
  CreateHostedZoneCommand,
  ListHostedZonesByNameCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const route53 = simAws.route53();

await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "z.example.test",
    CallerReference: "z-zone",
  }),
);

await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "a.example.test",
    CallerReference: "a-zone",
  }),
);

await simAws.backgroundTasksComplete();

const listOutput = await route53.listHostedZonesByName(
  new ListHostedZonesByNameCommand({
    DNSName: "example.test",
  }),
);

const hostedZones = listOutput.HostedZones ?? [];
for (const hostedZone of hostedZones) {
  console.log(hostedZone.Name, hostedZone.Id);
}
```

The simulator supports duplicate Hosted Zone names when they have different caller references or
CloudFormation logical IDs.

## Listing records in a Hosted Zone

Use `ListResourceRecordSetsCommand` to read back the records a Hosted Zone holds, whether they were
created through the SDK or by sim CloudFormation.

```typescript sim-route53-list-resource-record-sets
/**
 * Listing the records in a simulated Route53 Hosted Zone.
 */

import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
  ListResourceRecordSetsCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const route53 = simAws.route53();

const hostedZoneCreation = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "records-listing-zone",
  }),
);

const hostedZoneId = hostedZoneCreation.HostedZone?.Id;

await route53.changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "www.example.test",
            Type: "CNAME",
            TTL: 300,
            ResourceRecords: [{ Value: "my-site.s3-website.eu-west-2" }],
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();

const listOutput = await route53.listResourceRecordSets(
  new ListResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
  }),
);

const recordSets = listOutput.ResourceRecordSets ?? [];
for (const recordSet of recordSets) {
  console.log(recordSet.Name, recordSet.Type, recordSet.ResourceRecords);
}
```

Records are returned in Route53 DNS name order, which compares names from the rightmost label
inwards. The zone apex comes first, then names are grouped by shared parent, so `example.test.`
sorts before `api.example.test.`, which sorts before `b.api.example.test.` and then
`www.example.test.`. Where one name holds several record types, the record type breaks the tie.

Record names are returned with a trailing dot, as Route53 returns them.

Paginate with `MaxItems`. When the listing is truncated, `IsTruncated` is `true` and
`NextRecordName` and `NextRecordType` identify the first record of the next page, which you pass
back as `StartRecordName` and `StartRecordType`. Marker names are normalised, so `www.example.test`
and `WWW.EXAMPLE.TEST.` select the same starting point.

Alias records are returned with an `AliasTarget` in place of `ResourceRecords`. The simulator stores
an alias target as a record value plus an alias flag, and `AliasTarget.DNSName` is returned.
`AliasTarget.HostedZoneId` is outside the stored record, and is left out.

## Inspecting hosted zones in a browser

A served simulated AWS environment reports its Route53 state at `dns.sim-aws.localhost`. You can see
which hosted zones and records exist without writing code to read them back.

```typescript sim-route53-zone-summary
/**
 * Inspecting simulated Route53 hosted zones in a browser.
 */

import { CreateHostedZoneCommand } from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

await simAws.route53().createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "browsable-zone",
  }),
);

await simAws.backgroundTasksComplete();

const srv = await serveSimAws({ simAws });

// Open this in a browser to see every hosted zone and record.
console.log(`http://dns.sim-aws.localhost:${srv.port}/`);
```

The page lists each hosted zone with its ID, synchronization status and record count, then a table
of that zone's records in Route53 DNS name order. Alias records show their target marked `(alias)`
with an em dash in place of a TTL, because Route53 answers an alias using the TTL of whatever it
points at.

Hosted zones from every simulated Account appear, not just the default one, because Route53 name
resolution is environment-wide even though the Route53 service object is Account-scoped.

`dns.sim-aws.localhost` is where the summary is served, not a name it answers for. It is a built-in
Yulin hostname. It stays reachable whatever records your test creates, and it stands apart from any
hosted zone you might name `dns`.

## Querying simulated records with dig

A served simulated environment answers real DNS queries over UDP, on the same port number the HTTP
server took on TCP. UDP and TCP port namespaces are separate, and one number covers both.

```typescript sim-route53-dns
/**
 * Querying simulated Route53 records with a DNS client.
 */

import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const route53 = simAws.route53();

const hostedZoneCreation = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "dns-zone",
  }),
);

await route53.changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneCreation.HostedZone?.Id,
    ChangeBatch: {
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "www.example.test",
            Type: "CNAME",
            TTL: 300,
            ResourceRecords: [{ Value: "my-site.s3-website.eu-west-2" }],
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();

const srv = await serveSimAws({ simAws });

console.log(`dig @127.0.0.1 -p ${srv.dnsPort} www.example.test`);
```

Running that `dig` command against the served simulator:

```text
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 17691
;; flags: qr aa rd; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 0

www.example.test.             300  IN  CNAME  my-site.s3-website.eu-west-2.
my-site.s3-website.eu-west-2.  60  IN  A      127.0.0.1
```

The CNAME is followed and an address record is synthesised for the simulated S3 website, pointing at
the address the local HTTP server listens on. A name that resolves to a simulated service therefore
answers with somewhere you can actually make a request.

Any DNS client works. Node's own resolver needs no extra dependency, which suits a test:

```typescript sim-route53-dns-resolver
/**
 * Resolving a simulated Route53 record with Node's DNS resolver.
 */

import { Resolver } from "node:dns/promises";

import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const route53 = simAws.route53();

const zone = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "resolver-zone",
  }),
);

await route53.changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: zone.HostedZone?.Id,
    ChangeBatch: {
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "api.example.test",
            Type: "A",
            TTL: 60,
            ResourceRecords: [{ Value: "192.0.2.10" }],
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();

const srv = await serveSimAws({ simAws });

try {
  const resolver = new Resolver({ timeout: 1000, tries: 1 });
  resolver.setServers([`127.0.0.1:${srv.dnsPort}`]);

  const addresses = await resolver.resolve4("api.example.test");

  console.log(addresses); // [ '192.0.2.10' ]
} finally {
  await srv.close();
}
```

A short timeout with a single try keeps a test failing quickly, where a
missing record would otherwise leave it hanging.

### Ports

DNS binds the same port number as HTTP, as a convenience and not a guarantee. Where the number is
already held on UDP by something else, DNS binds an ephemeral port instead. Read `srv.dnsPort`, which
may differ from `srv.port`.

Port 53 is left alone, since binding it would need root. To resolve simulated names system-wide
without naming a port, point your resolver at the simulator yourself. On macOS, a file such as `/etc/resolver/test`
containing `nameserver 127.0.0.1` and `port <dnsPort>` makes the whole `.test` TLD resolve through
it. That is a change to your machine, so Yulin does not make it for you. With that in place, the HTTP
server answers for those names too. See [Local hostname resolution](#local-hostname-resolution).

### What is answered

- Six of the ten record types sim Route53 stores, being `A`, `AAAA`, `CNAME`, `TXT`, `NS` and
  `SOA`. A query for a stored type outside that list (`MX`, `SRV`, `CAA` or `PTR`) is answered as no
  data, the same as a query type the simulator has never heard of. Those records exist to be
  asserted on. What a browser reaching a simulated site needs is an address or a CNAME. See
  [Record types](#record-types).
- CNAME chains are followed, so an `A` query on a name holding a CNAME returns the CNAME and the
  address it leads to together. Chains are bounded, and a cycle stops immediately.
- Alias records are resolved to the address of whatever they point at, answered under the name that
  holds the alias, as Route53 answers an alias. The alias record itself never appears.
- A name in a zone holding no record of the queried type gives `NOERROR` with no answers, and a name
  the zone lacks gives `NXDOMAIN`. Both carry the zone `SOA` in the authority section, so a resolver
  knows how long it may cache the negative answer. Where the zone holds no `SOA` of its own, one is
  synthesised.
- A name held by no hosted zone is `REFUSED`, and never `NXDOMAIN`. The simulator answers only for
  the zones it holds, and cannot claim a name exists nowhere.
- Zones from every simulated Account are answered, because DNS resolution is environment-wide.

Left out are EDNS0, the `ANY` query type, DNS over TCP, more than one question per query, recursion,
and DNSSEC. Answers are always authoritative.

## Local hostname resolution

When Yulin is served on localhost, Route53 can map your own test hostnames to simulated service
targets. Request the local server using the hostname plus the `sim-aws.localhost` suffix. A test in
the same process needs no server at all, and is covered under
[Fetching a hostname in the same process](#fetching-a-hostname-in-the-same-process).

For example, if Route53 contains a record for `www.example.test`, request:

```text
http://www.example.test.sim-aws.localhost:<port>/
```

The local server resolves the logical hostname `www.example.test` through sim Route53 and routes the
request to the simulated target named by the record.

The suffix is optional. It exists so a client can reach the local server without the hostname
resolving on the public internet, and it is only needed while the name resolves to the simulator
nowhere else. Once a resolver is pointed at the served DNS server, as under [Ports](#ports) above,
the name resolves on its own and the request can be made under the hostname your application really
uses:

```text
http://www.example.test:<port>/
```

Both forms reach the same simulated target. The suffix-free form is what makes an exact apex `Host`
possible. A CloudFront Function redirecting `example.test` to `www.example.test` can then be
exercised in a browser.

This is most useful with CloudFront aliases. You can create a CloudFront distribution, create a
Route53 record pointing at the distribution hostname, then fetch through your application hostname.

The hostname you fetch has to be one of the Distribution's alternate domain names, the same as it
would be in real CloudFront, which refuses a `Host` outside the ones it serves. So the record name
goes in the Distribution's `Aliases` as well as in the Route53 record. Real CloudFront also wants an
ACM certificate covering those names, described under
[Viewer certificates](https://yulinsim.dev/services/cloudfront/#viewer-certificates). It is left out here because this
request is served over plain HTTP on localhost.

```typescript sim-route53-cloudfront-localhost
/**
 * Serving a CloudFront distribution through a simulated Route53 hostname.
 */

import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";
import {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const s3 = simAws.s3();
  const cloudFront = simAws.cloudFront();
  const route53 = simAws.route53();

  await s3.createBucket(
    new CreateBucketCommand({
      Bucket: "site-bucket",
    }),
  );

  await s3.putObject(
    new PutObjectCommand({
      Bucket: "site-bucket",
      Key: "index.html",
      Body: "<h1>Hello from a Route53 hostname</h1>",
      ContentType: "text/html; charset=utf-8",
    }),
  );

  // The Distribution's S3 Origin reads the Bucket anonymously, so the site has
  // to be publicly readable.
  await s3.putPublicAccessBlock(
    new PutPublicAccessBlockCommand({
      Bucket: "site-bucket",
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
      },
    }),
  );
  await s3.putBucketPolicy(
    new PutBucketPolicyCommand({
      Bucket: "site-bucket",
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::site-bucket/*",
        },
      }),
    }),
  );

  const distributionCreation = await cloudFront.createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "route53-site-distribution",
        Comment: "Route53 local site distribution",
        Enabled: true,
        Aliases: { Quantity: 1, Items: ["www.example.test"] },
        DefaultRootObject: "index.html",
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: "site-origin",
              DomainName: "site-bucket.s3.amazonaws.com",
              S3OriginConfig: {
                OriginAccessIdentity: "",
              },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
        },
      },
    }),
  );

  const distributionHostname = distributionCreation.Distribution!.DomainName!;

  const hostedZoneCreation = await route53.createHostedZone(
    new CreateHostedZoneCommand({
      Name: "example.test",
      CallerReference: "route53-localhost-zone",
    }),
  );

  const hostedZoneId = hostedZoneCreation.HostedZone!.Id!;

  await route53.changeResourceRecordSets(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Changes: [
          {
            Action: "CREATE",
            ResourceRecordSet: {
              Name: "www.example.test",
              Type: "CNAME",
              TTL: 300,
              ResourceRecords: [{ Value: distributionHostname }],
            },
          },
        ],
      },
    }),
  );

  await simAws.backgroundTasksComplete();

  const response = await fetch(
    `http://www.example.test.sim-aws.localhost:${srv.port}/`,
  );

  console.log(response.status);
  console.log(await response.text());
} finally {
  await srv.close();
}
```

You can also call `srv.localUrl(...)` with a URL that contains the simulated hostname when you want
the server to adapt it to the selected local port.

### Fetching a hostname in the same process

`SimAwsHttp` sends a request into the simulation with nothing listening. It resolves the hostname
through sim Route53 the same way the local server does. The name is requested as your application
writes it, with no suffix and no port.

Reach for `SimAwsHttp` in a test, and for `serveSimAws` when the request comes from outside the
process, such as a browser, `curl` or an SDK client pointed at a local endpoint. Both go through the
same routing and service code, and a request answered one way is answered the same way the other.
See [requests without a port](https://yulinsim.dev/serve/#requests-without-a-port "Requests without a port docs").

Below, `www.example.test` is redirected to the apex. One request checks four pieces of the stack at
once. The ACM certificate has to cover the alternate domain name, the Hosted Zone record has to
point at the Distribution, the Distribution has to accept that `Host`, and the viewer-request
Function has to write the `Location`. An assertion against the synthesized template passes with the
Route53 record missing.

```typescript sim-route53-in-process-redirect
/**
 * Redirecting a simulated Route53 hostname with no server listening.
 */

import { RequestCertificateCommand } from "@aws-sdk/client-acm";
import {
  CreateDistributionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-cloudfront";
import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";
import {
  makeCffFunctionCodeInput,
  type CloudFrontFunction,
} from "@kensio/yulin/cloudfront";
import { SimAwsHttp } from "@kensio/yulin/serve";

const simAws = new SimAws();
const route53 = simAws.route53();
const cloudFront = simAws.cloudFront();

const hostedZoneCreation = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "redirect-zone",
  }),
);

// CloudFront reads its certificate from us-east-1, wherever the rest of the
// stack lives.
const certificateRequest = await simAws
  .region("us-east-1")
  .acm()
  .requestCertificate(
    new RequestCertificateCommand({ DomainName: "www.example.test" }),
  );

await simAws
  .region("us-east-1")
  .acm()
  .completeDnsValidation(certificateRequest.CertificateArn);

function redirectToApex(
  event: CloudFrontFunction.ViewerRequestEvent,
): CloudFrontFunction.Response {
  const query = Object.entries(event.request.querystring)
    .map(([name, parameter]) => `${name}=${parameter.value}`)
    .join("&");

  return {
    statusCode: 301,
    statusDescription: "Moved Permanently",
    headers: {
      location: {
        value: `https://example.test${event.request.uri}${query.length > 0 ? `?${query}` : ""}`,
      },
    },
  };
}

const functionCreation = await cloudFront.createFunction(
  new CreateFunctionCommand({
    Name: "redirect-to-apex",
    FunctionConfig: {
      Comment: "Redirect www to the apex",
      Runtime: "cloudfront-js-2.0",
    },
    FunctionCode: makeCffFunctionCodeInput(redirectToApex),
  }),
);

const distributionCreation = await cloudFront.createDistribution(
  new CreateDistributionCommand({
    DistributionConfig: {
      CallerReference: "redirect-distribution",
      Comment: "Apex redirect",
      Enabled: true,
      Aliases: { Quantity: 1, Items: ["www.example.test"] },
      // The Function answers every request, and the Origin goes unread.
      Origins: {
        Quantity: 1,
        Items: [
          {
            Id: "apex-origin",
            DomainName: "origin.example.test",
            CustomOriginConfig: {
              HTTPPort: 80,
              HTTPSPort: 443,
              OriginProtocolPolicy: "http-only",
            },
          },
        ],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "apex-origin",
        ViewerProtocolPolicy: "redirect-to-https",
        FunctionAssociations: {
          Quantity: 1,
          Items: [
            {
              EventType: "viewer-request",
              FunctionARN: functionCreation.FunctionMetadata.FunctionARN,
            },
          ],
        },
      },
      ViewerCertificate: {
        ACMCertificateArn: certificateRequest.CertificateArn,
        SSLSupportMethod: "sni-only",
      },
    },
  }),
);

await route53.changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneCreation.HostedZone!.Id!,
    ChangeBatch: {
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "www.example.test",
            Type: "A",
            AliasTarget: {
              HostedZoneId: "Z2FDTNDATAQYW2",
              DNSName: distributionCreation.Distribution!.DomainName!,
              EvaluateTargetHealth: false,
            },
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();

const http = new SimAwsHttp({ simAws });
const response = await http.fetch("https://www.example.test/docs/x?a=1");

console.log(response.status); // 301
console.log(response.headers.get("location")); // https://example.test/docs/x?a=1
```

`SimAwsHttp` returns the response the service answered with, and leaves the `Location` for the
caller to follow.

Take the record out and the request answers 501. Nothing else in the simulation answers for
`www.example.test`. Take the name out of the Distribution's `Aliases` and it answers 404, since the
`Host` has to be one of the alternate domain names, as it does on AWS.

### What a name can resolve to

A record chain ends when it reaches a hostname a simulated service owns. Those are recognised by
their shape, and the value to point a record at is whatever the service reported:

| Hostname                                 | What it reaches                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `<distribution-id>.cloudfront.net`       | a [CloudFront](https://yulinsim.dev/services/cloudfront/) distribution   |
| `<name>-<id>.<region>.elb.amazonaws.com` | an [ELBv2](https://yulinsim.dev/services/elbv2/) load balancer           |
| `<bucket>.s3-website.<region>`           | an [S3](https://yulinsim.dev/services/s3/) bucket website                |
| `<bucket>.s3.<region>`                   | the S3 REST endpoint                                                     |
| `<url-id>.lambda-url.<region>`           | a [Lambda](https://yulinsim.dev/services/lambda/) Function URL           |
| `<api-id>.execute-api.<region>`          | an [API Gateway](https://yulinsim.dev/services/apigatewayv2/) HTTP API   |
| `d-<id>.execute-api.<region>`            | an API Gateway custom domain                                             |
| `cognito-idp.<region>`                   | the [Cognito](https://yulinsim.dev/services/cognito/) user pool endpoint |

The hostnames the AWS SDK talks to are written without their `.amazonaws.com` or `.on.aws` tail,
the same rewriting Yulin applies to an SDK endpoint. A load balancer's name keeps its whole domain,
since it goes unrewritten. `DNSName` is what a record points at and what a client asks for. A custom
domain's regional endpoint is read either way, so a record can point at `RegionalDomainName` as API
Gateway answered it.

A name pointing at a load balancer resolves to it. A request to that name reaches the load balancer's
listeners and rules, and a `host-header` condition on a rule sees the name the request was made to,
in place of the load balancer's own:

```typescript sim-route53-elbv2-alias
/**
 * Resolving a name to a simulated load balancer, over HTTP and over DNS.
 */

import { Resolver } from "node:dns/promises";

import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const elbV2 = simAws.elbV2();

const created = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "shop-alb" }),
);

await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: created.LoadBalancers?.[0]?.LoadBalancerArn,
    Protocol: "HTTP",
    Port: 80,
    DefaultActions: [
      {
        Type: "fixed-response",
        FixedResponseConfig: {
          StatusCode: "200",
          ContentType: "text/plain",
          MessageBody: "orders",
        },
      },
    ],
  }),
);

const zone = await simAws.route53().createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "shop-zone",
  }),
);

// A CNAME below the apex reaches a load balancer as an alias record does.
await simAws.route53().changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: zone.HostedZone?.Id,
    ChangeBatch: {
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "api.example.test",
            Type: "CNAME",
            TTL: 300,
            ResourceRecords: [{ Value: created.LoadBalancers?.[0]?.DNSName }],
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();

const srv = await serveSimAws({ simAws });

try {
  const response = await fetch(srv.localUrl("http://api.example.test/orders"));

  console.log(await response.text()); // "orders"

  const resolver = new Resolver({ timeout: 1000, tries: 1 });
  resolver.setServers([`127.0.0.1:${srv.dnsPort}`]);

  console.log(await resolver.resolve4("api.example.test")); // [ '127.0.0.1' ]
} finally {
  await srv.close();
}
```

A request served under the suffix reaches the listener on port 80, since the port such a request
carries is the local server's and never one a client chose. See
[Simulated Elastic Load Balancing](https://yulinsim.dev/services/elbv2/) for what happens once the request is there.

### A hostname a resource claimed for itself

An API Gateway custom domain answers on the hostname it was created with, and a record for that
hostname takes it back. The record decides where the name goes, as it does on AWS, where the custom
domain name is reached only through one. A custom domain no record names resolves to the domain.

A Cognito hosted domain answers on its hostname whatever records exist. Real Cognito puts a
CloudFront distribution in front of a custom domain and expects a record pointing at that
distribution, and the distribution name it reports resolves to no simulated service here.

## DNSSEC

A Hosted Zone can be signed. Signing needs a key-signing key, and a key-signing key needs a KMS
customer managed key. That is an enabled `ECC_NIST_P256` `SIGN_VERIFY` key, the only kind real
Route53 accepts.

```typescript sim-route53-dnssec
/**
 * Signing a simulated Route53 Hosted Zone with DNSSEC.
 */

import { CreateKeyCommand } from "@aws-sdk/client-kms";
import {
  CreateHostedZoneCommand,
  CreateKeySigningKeyCommand,
  EnableHostedZoneDNSSECCommand,
  GetDNSSECCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const zone = await simAws.route53().createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "dnssec-zone",
  }),
);
const HostedZoneId = zone.HostedZone?.Id;

const key = await simAws.kms().createKey(
  new CreateKeyCommand({
    KeySpec: "ECC_NIST_P256",
    KeyUsage: "SIGN_VERIFY",
  }),
);

await simAws.route53().createKeySigningKey(
  new CreateKeySigningKeyCommand({
    CallerReference: "ksk",
    HostedZoneId,
    KeyManagementServiceArn: key.KeyMetadata?.Arn,
    Name: "zone_signing_key",
    Status: "ACTIVE",
  }),
);

await simAws
  .route53()
  .enableHostedZoneDnssec(new EnableHostedZoneDNSSECCommand({ HostedZoneId }));

const dnssec = await simAws
  .route53()
  .getDnssec(new GetDNSSECCommand({ HostedZoneId }));

console.log(dnssec.Status?.ServeSignature); // "SIGNING"

// The DS record the zone's registrar would be given, computed from the KMS
// key's own public key: "<KeyTag> 13 2 <DigestValue>".
console.log(dnssec.KeySigningKeys?.[0]?.DSRecord);
```

Every part of the key-signing key is computed from the KMS key. Its `PublicKey` is that key's own
public key in the base64 form RFC 4034 defines, its `KeyTag` comes from the RFC 4034 Appendix B
algorithm, and its `DigestValue` is the SHA-256 delegation signer digest over the zone name and the
DNSKEY. A test can assert on the DS record it would hand to a registrar, and two zones on two keys
get two different ones.

Adding a key-signing key leaves signing off, and stopping signing leaves the keys in place, the same
as on AWS. `ActivateKeySigningKey` and `DeactivateKeySigningKey` move a key between `ACTIVE` and
`INACTIVE`. `DeleteKeySigningKey` refuses a key that is still active. `EnableHostedZoneDNSSEC`
refuses a zone with no active key to sign with, and `DisableHostedZoneDNSSEC` refuses an unsigned
zone.

A KMS key that is symmetric, disabled, or absent altogether is refused when the key-signing key is
created. A stack naming the wrong key fails here, ahead of the deployment. A signed zone cannot
be deleted either, for the reason real Route53 gives. The DS record at the parent would be left
pointing at a zone that had gone.

The key's policy goes unchecked. Real Route53 needs the key to allow `kms:DescribeKey`,
`kms:GetPublicKey` and `kms:Sign` to the `dnssec-route53.amazonaws.com` service principal, and
`kms:CreateGrant` conditioned on `kms:GrantIsForAWSResource`, which is what CDK's `KeySigningKey`
construct adds for you. A key created here without those statements takes a key-signing key anyway,
and a template that would fail on AWS for that reason deploys here.

### DNSSEC from CloudFormation

`AWS::Route53::KeySigningKey` and `AWS::Route53::DNSSEC` deploy, which is the shape CDK's
`KeySigningKey` construct and `CfnDNSSEC` synthesize.

```typescript sim-route53-cloudformation-dnssec
/**
 * Deploying a signed Route53 Hosted Zone from CloudFormation.
 */

import { GetDNSSECCommand } from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "dns-stack",
  template: {
    Resources: {
      SiteZone: {
        Type: "AWS::Route53::HostedZone",
        Properties: { Name: "example.test" },
      },
      ZoneSigningKey: {
        Type: "AWS::KMS::Key",
        Properties: {
          KeySpec: "ECC_NIST_P256",
          KeyUsage: "SIGN_VERIFY",
        },
      },
      ZoneKeySigningKey: {
        Type: "AWS::Route53::KeySigningKey",
        Properties: {
          HostedZoneId: { Ref: "SiteZone" },
          KeyManagementServiceArn: { "Fn::GetAtt": ["ZoneSigningKey", "Arn"] },
          Name: "zone_signing_key",
          Status: "ACTIVE",
        },
      },
      ZoneDnssec: {
        Type: "AWS::Route53::DNSSEC",
        Properties: { HostedZoneId: { Ref: "SiteZone" } },
        DependsOn: "ZoneKeySigningKey",
      },
    },
    Outputs: {
      ZoneId: { Value: { Ref: "SiteZone" } },
    },
  },
});
await stack.waitForDeployComplete();

const hostedZoneId = stack.output("ZoneId");

if (typeof hostedZoneId !== "string") {
  throw new TypeError("The stack did not output a hosted zone ID");
}

const dnssec = await simAws
  .route53()
  .getDnssec(new GetDNSSECCommand({ HostedZoneId: hostedZoneId }));

console.log(dnssec.Status?.ServeSignature); // "SIGNING"
console.log(dnssec.KeySigningKeys?.[0]?.Status); // "ACTIVE"
```

`Ref` on an `AWS::Route53::KeySigningKey` returns `<HostedZoneId>|<Name>`, which CDK reads as
`keySigningKeyId`. `Ref` on an `AWS::Route53::DNSSEC` returns the hosted zone ID. Neither type has
any `Fn::GetAtt` attributes, and a `Fn::GetAtt` on one is refused.

Tearing the stack down stops signing and takes the key-signing key with it, deactivating it first,
because an active key cannot be deleted.

## CloudFormation Hosted Zones

Sim CloudFormation can create Route53 Hosted Zones from `AWS::Route53::HostedZone`.

```typescript sim-route53-cloudformation-hosted-zone
/**
 * Creating a Route53 Hosted Zone through simulated CloudFormation.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "route53-zone-stack",
  template: {
    Resources: {
      SiteZone: {
        Type: "AWS::Route53::HostedZone",
        Properties: {
          Name: "example.test",
          HostedZoneConfig: {
            Comment: "Example hosted zone",
          },
        },
      },
    },
    Outputs: {
      HostedZoneId: {
        Value: {
          Ref: "SiteZone",
        },
      },
      HostedZoneNameServers: {
        Value: {
          "Fn::GetAtt": ["SiteZone", "NameServers"],
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.output("HostedZoneId"));
console.log(stack.outputs.get("HostedZoneNameServers")?.value);
```

For `AWS::Route53::HostedZone`, `Ref` returns the simulated Hosted Zone ID. `Fn::GetAtt` supports
`Id` and `NameServers`.

## CloudFormation RecordSets

Sim CloudFormation can create sim Route53 records from `AWS::Route53::RecordSet`.

```typescript sim-route53-cloudformation-record-set
/**
 * Creating Route53 records through simulated CloudFormation.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "route53-record-stack",
  template: {
    Resources: {
      SiteZone: {
        Type: "AWS::Route53::HostedZone",
        Properties: {
          Name: "example.test",
        },
      },
      SiteRecord: {
        Type: "AWS::Route53::RecordSet",
        Properties: {
          HostedZoneId: {
            Ref: "SiteZone",
          },
          Name: "www.example.test",
          Type: "A",
          TTL: "300",
          ResourceRecords: ["192.0.2.1"],
        },
      },
    },
  },
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();
```

Record sets can use either `HostedZoneId` or `HostedZoneName`. `HostedZoneId` is usually the
clearest option in templates, since it can reference the zone resource directly.

### Unsupported record types in a template

A real DNS stack usually holds a few records beside the point of what is being tested. When one of
them declares a [record type](#record-types) sim Route53 leaves unstored, the RecordSet is skipped
and the rest of the stack deploys, the same way an unsupported resource type is. The skipped
RecordSet is in `stack.skippedResources` with a `skippedReason` naming the record type.

```typescript sim-route53-skipped-record-type
/**
 * Deploying a template that carries a record type sim Route53 does not store.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "signed-dns-stack",
  template: {
    Resources: {
      SiteZone: {
        Type: "AWS::Route53::HostedZone",
        Properties: {
          Name: "example.test",
        },
      },
      SiteRecord: {
        Type: "AWS::Route53::RecordSet",
        Properties: {
          HostedZoneId: { Ref: "SiteZone" },
          Name: "www.example.test",
          Type: "A",
          TTL: "300",
          ResourceRecords: ["192.0.2.1"],
        },
      },
      DelegationSigner: {
        Type: "AWS::Route53::RecordSet",
        Properties: {
          HostedZoneId: { Ref: "SiteZone" },
          Name: "example.test",
          Type: "DS",
          TTL: "3600",
          ResourceRecords: ["12345 13 2 49FD46E6C4B45C55D4AC"],
        },
      },
    },
  },
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

// The A record the test is about was created.
console.log(stack.getResource("SiteRecord")?.status);
// "CREATE_COMPLETE"

console.log(stack.skippedResources.map((resource) => resource.logicalId));
// ["DelegationSigner"]

console.log(stack.getResource("DelegationSigner")?.skippedReason);
// "Unsupported sim Route53 CloudFormation Resource DelegationSigner: sim Route53
//  does not model the DS record type, and stores A, AAAA, CAA, CNAME, MX, NS,
//  PTR, SOA, SRV, TXT."
```

Only the record type is treated this way. A RecordSet that makes no sense as a RecordSet still fails
the stack. A non-string `Name`, a non-string `Type`, or a negative `TTL` is refused. An unmodelled
record type is a gap in the simulation, where a malformed RecordSet is a broken template.

Tearing the stack down works with the skipped RecordSet in it. Nothing was created for it, and the
teardown steps over it without asking Route53 to remove a record it never stored.

## CDK integration

You can synthesize a CDK app and deploy the generated template with sim CloudFormation. CDK Route53
Hosted Zones and records can then participate in the same local simulated AWS environment as S3 and
CloudFront.

A common pattern for local website tests is:

1. Create a CDK stack with an S3 Bucket, CloudFront Distribution, Route53 Hosted Zone, and Route53
   record.
2. Synthesize the CDK app.
3. Deploy the synthesized template through `simAws.cloudFormation().deployTemplateFile(...)`.
4. Serve the simulated AWS environment with `serveSimAws(...)`.
5. Fetch the site through the Route53 hostname using the `sim-aws.localhost` suffix.

```typescript sim-route53-cdk-template-file
/**
 * Deploying a CDK template with Route53 resources into simulated AWS.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const stack = await simAws
    .cloudFormation()
    .deployTemplateFile(
      path.join(process.cwd(), "cdk.out", "TestStack.template.json"),
    );

  await stack.waitForDeployComplete();
  await simAws.backgroundTasksComplete();

  const response = await fetch(
    `http://www.example.test.sim-aws.localhost:${srv.port}/`,
  );

  console.log(response.status);
  console.log(await response.text());
} finally {
  await srv.close();
}
```

This lets local integration tests use the same CDK infrastructure shape as production while keeping
the test process local.

A CDK app whose Hosted Zone comes from `HostedZone.fromLookup` names a real Hosted Zone ID
throughout its template, in place of creating the zone. The template deploys as it is. The zone is
registered under that ID as the first RecordSet naming it is created, with its name inferred from the
record names. Register it yourself with
[Registering a Hosted Zone with a chosen ID](#registering-a-hosted-zone-with-a-chosen-id) when a test
depends on the zone's name, or when no record in the stack sits inside it.

## Accounts and Regions

Use `SimAws` scopes to create Route53 state in different simulated Accounts and Regions.

```typescript sim-route53-account-region-scoping
/**
 * Simulated Route53 Account and Region scoping.
 */

import { CreateHostedZoneCommand } from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const defaultRoute53 = simAws.route53();
const euWest2Route53 = simAws.region("eu-west-2").route53();
const accountRoute53 = simAws.account("111111111111").route53();
const scopedRoute53 = simAws
  .account("222222222222")
  .region("ap-east-1")
  .route53();

await defaultRoute53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "default.example.test",
    CallerReference: "default-zone",
  }),
);

await euWest2Route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "eu-west-2.example.test",
    CallerReference: "eu-west-2-zone",
  }),
);

await accountRoute53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "account.example.test",
    CallerReference: "account-zone",
  }),
);

await scopedRoute53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "scoped.example.test",
    CallerReference: "scoped-zone",
  }),
);
```

Each `SimAws` instance has its own isolated state. Create a fresh instance per test, or share one
across related local setup.

## Standalone SimRoute53

If you only need Route53 alone, instantiate `SimRoute53` directly.

```typescript sim-route53-standalone
/**
 * Standalone simulated Route53 instance.
 */

import { CreateHostedZoneCommand } from "@aws-sdk/client-route-53";

import { SimRoute53 } from "@kensio/yulin/route53";

const route53 = new SimRoute53();

const hostedZoneCreation = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "standalone.example.test",
    CallerReference: "standalone-zone",
  }),
);

console.log(hostedZoneCreation.HostedZone?.Id);
```

A standalone `SimRoute53` instance has its own isolated state, standing apart from any wider
`SimAws` environment. Use `SimAws` when Route53 needs to resolve names to other simulated services.

## Supported operations

Sim Route53 currently supports:

- `CreateHostedZoneCommand`, `GetHostedZoneCommand` and `ListHostedZonesByNameCommand`
- Registering a Hosted Zone with a chosen Hosted Zone ID, for a zone a template looked up rather
  than created
- `ChangeResourceRecordSetsCommand` and `ListResourceRecordSetsCommand`
- `CREATE`, `UPSERT` and `DELETE` record changes
- Stored record types: `A`, `AAAA`, `CAA`, `CNAME`, `MX`, `NS`, `PTR`, `SOA`, `SRV` and `TXT`
- Local HTTP hostname routing through `CNAME` records that point to simulated service hostnames
- Alias records, with `AliasTarget.DNSName` stored as the record value
- Local hostname resolution, with or without the `sim-aws.localhost` suffix on the requested hostname
- Hostname resolution with no server listening, through `SimAwsHttp`
- Names resolving to simulated S3 websites and buckets, CloudFront distributions, ELBv2 load
  balancers, Lambda Function URLs, HTTP APIs and the Cognito user pool endpoint, listed under
  [What a name can resolve to](#what-a-name-can-resolve-to)
- A browser-viewable hosted zone and record summary at `dns.sim-aws.localhost`
- DNS answers over UDP for `A`, `AAAA`, `CNAME`, `TXT`, `NS` and `SOA`, so those records can be
  queried with `dig` or any DNS client
- `CreateKeySigningKeyCommand`, `ActivateKeySigningKeyCommand`,
  `DeactivateKeySigningKeyCommand`, `DeleteKeySigningKeyCommand`,
  `EnableHostedZoneDNSSECCommand`, `DisableHostedZoneDNSSECCommand` and `GetDNSSECCommand`
- The `AWS::Route53::HostedZone` and `AWS::Route53::RecordSet` CloudFormation resources, with a
  RecordSet declaring an unstored record type skipped rather than failing the stack
- The `AWS::Route53::KeySigningKey` and `AWS::Route53::DNSSEC` CloudFormation resources
- CDK-created Route53 Hosted Zones and records in synthesized templates

The simulator focuses on useful behaviour for tests and local development, ahead of full Route53
feature parity. Unsupported Route53 options may be ignored or may throw errors depending on whether
the simulator needs them to model the requested behaviour.

## Limitations

Where sim Route53 knowingly behaves differently from AWS:

- **A RecordSet naming an absent Hosted Zone creates one.** CloudFormation would refuse with
  `NoSuchHostedZone`, because the ID names a zone in an account the simulation is not. Every
  template built with `HostedZone.fromLookup` would then be undeployable here. The zone is
  registered on demand instead. See
  [A zone a template only names](#a-zone-a-template-only-names).
- **The name of such a zone is a guess.** A synthesized template says nothing about what a
  looked-up zone is called. The name is inferred from the records that reference it, and is only as
  specific as they are. Register the zone yourself when a test depends on its name.
- **A signed zone is signed on paper only.** No RRSIG records are produced, no DNSKEY records are
  added to the zone, and a query answered over UDP is unsigned whatever `GetDNSSEC` says. Signing is
  observable through `GetDNSSEC`, which holds the key-signing keys and the DS record fields. Sim
  Route53 is no general DNS server, and an RRSIG needs canonical RRset ordering and wire-format
  signing that nothing here would read back.
- **A key-signing key never rotates, and a zone never reports trouble.** `ACTIVE` and `INACTIVE` are
  the only key statuses, and `SIGNING` and `NOT_SIGNING` the only zone statuses. Real Route53 also
  has `DELETING`, `ACTION_NEEDED` and `INTERNAL_FAILURE`, which describe a key mid-operation or a
  zone that needs attention, and neither is produced here.
- **A key-signing key's KMS key policy goes unchecked.** Real Route53 refuses a key that leaves the
  `dnssec-route53.amazonaws.com` service principal out, and this accepts one. A template missing
  those statements deploys here and fails on AWS. Checking it would mean authorizing the service
  principal against the key policy, which is its own piece of work.
- **DNSSEC needs KMS wired to Route53.** A standalone `new SimRoute53()` has no simulated KMS to
  resolve a key ARN against, so `CreateKeySigningKey` refuses. Reach Route53 through `SimAws` when a
  test signs a zone.
