# Simulated Route53

Yulin includes a simulated Route53 service for tests and local development.

Sim Route53 can be used directly through `SimAws`, instantiated on its own as `SimRoute53`, and used
by sim CloudFormation when deploying Route53 resources from CloudFormation or CDK templates. When
served on localhost, Route53 records can route custom local hostnames to other simulated AWS
services, such as simulated CloudFront distributions or simulated S3 bucket websites.

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

Hosted Zone creation uses background tasks to move the zone to `INSYNC`. If your test needs final
state, call `await simAws.backgroundTasksComplete()` before continuing.

Hosted Zone IDs are accepted in any real Route53 shape: a `Z` prefix followed by uppercase
alphanumerics, up to 32 characters. That means a real Hosted Zone ID copied out of an AWS account,
such as `Z2FDTNDATAQYW2`, can be used in your test setup. An ID with no matching Hosted Zone gives
`NoSuchHostedZone`, while a malformed one gives `InvalidInput`. Commands also accept the
`/hostedzone/Z...` form as well as the bare ID.

## Registering a Hosted Zone with a chosen ID

`CreateHostedZoneCommand` allocates its own Hosted Zone ID, as real Route53 does, and takes none
from you. When something else already decided the ID, register the Hosted Zone as part of your test
setup instead.

The usual reason is a CDK app that looks its zone up with `HostedZone.fromLookup` rather than
creating it. That bakes the real Hosted Zone ID into the synthesized template, and every
`AWS::Route53::RecordSet` in the template names that ID. Registering the zone first means the
template deploys as it is, with no rewriting.

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
`HostedZoneAlreadyExists`, and one that is not a Route53 Hosted Zone ID with `InvalidInput`.

### A zone a template names but does not create

Registering the zone first is optional. An `AWS::Route53::RecordSet` naming a `HostedZoneId` that no
Hosted Zone holds gets one registered under that ID as the record is created, so a template built
with `HostedZone.fromLookup` deploys without being told separately about a zone it already describes.

The template does not carry the zone's name, only its ID, so the name is inferred from the records.
The first record to name the zone names it, and a record above that name widens it. A stack holding
`example.test` and `www.example.test` ends up with a zone called `example.test`. A stack holding only
`www.example.test` ends up with a zone called `www.example.test`.

Register the zone yourself when a test depends on its name, such as one listing zones by name, or
when its name is not a suffix of any record the stack holds. A registered zone keeps the name it was
given rather than inferring one, so its records are stored under the name you chose.

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
Route53 record should point to another simulated service hostname, such as a CloudFront
distribution.

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
`ListResourceRecordSetsCommand`, and declared as an `AWS::Route53::RecordSet`, so a zone that models
a real one — mail records, certificate pinning, a service record — deploys as it stands.

A type outside that list is not stored. `ChangeResourceRecordSetsCommand` rejects it, because the
call asked for a record the simulator cannot keep. A template declaring one is treated more gently:
the `AWS::Route53::RecordSet` is skipped and the rest of the stack deploys. See
[unsupported record types in a template](#unsupported-record-types-in-a-template).

Simulated DNS answers queries for six of them: `A`, `AAAA`, `CNAME`, `TXT`, `NS` and `SOA`. `MX`,
`SRV`, `CAA` and `PTR` are stored for a test to assert the presence and value of, not for a resolver
to act on, so a DNS query for one is answered as no data. See
[What is answered](#what-is-answered).

Values of those four are stored exactly as written, along with `TXT`. Nothing takes an `MX`
preference number or an `SRV` priority apart, so what you assert on is the string your stack
declared. Values of the other types are hostnames or addresses, and are normalized like DNS names so
they compare consistently.

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
              { Value: "10 in1-smtp.messagingengine.com." },
              { Value: "20 in2-smtp.messagingengine.com." },
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

// [ '10 in1-smtp.messagingengine.com.', '20 in2-smtp.messagingengine.com.' ]
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

Alias records are returned with an `AliasTarget` rather than `ResourceRecords`. The simulator stores
an alias target as a record value plus an alias flag, so `AliasTarget.DNSName` is returned.
`AliasTarget.HostedZoneId` is not part of the stored record and is not returned.

## Inspecting hosted zones in a browser

A served simulated AWS environment reports its Route53 state at `dns.sim-aws.localhost`, so you can
see which hosted zones and records exist without writing code to read them back.

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
Yulin hostname, so it stays reachable whatever records your test creates, and it is unrelated to any
hosted zone you might name `dns`.

## Querying simulated records with dig

A served simulated environment answers real DNS queries over UDP, on the same port number the HTTP
server took on TCP. UDP and TCP port namespaces are separate, so one number covers both.

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

Any DNS client works. Node's own resolver needs no extra dependency, which makes it convenient in
tests:

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

A short timeout with a single try keeps a test failing quickly rather than
hanging, should the record not be there.

### Ports

DNS binds the same port number as HTTP, but that is a convenience rather than a guarantee: if the
number is already held on UDP by something else, DNS binds an ephemeral port instead. Read
`srv.dnsPort` rather than assuming it matches `srv.port`.

Nothing binds port 53, which would need root. To resolve simulated names system-wide without naming a
port, point your resolver at the simulator yourself. On macOS, a file such as `/etc/resolver/test`
containing `nameserver 127.0.0.1` and `port <dnsPort>` makes the whole `.test` TLD resolve through
it. That is a change to your machine, so Yulin does not make it for you. With that in place, the HTTP
server answers for those names too: see [Local hostname resolution](#local-hostname-resolution).

### What is answered

- Six of the ten record types sim Route53 stores: `A`, `AAAA`, `CNAME`, `TXT`, `NS` and `SOA`. A
  query for a stored type outside that list — `MX`, `SRV`, `CAA` or `PTR` — is answered as no data,
  the same as a query type the simulator does not recognise at all. Those records exist to be
  asserted on rather than resolved; what a browser reaching a simulated site needs is an address or
  a CNAME. See [Record types](#record-types).
- CNAME chains are followed, so an `A` query on a name holding a CNAME returns the CNAME and the
  address it leads to together. Chains are bounded, and a cycle stops immediately.
- Alias records are resolved to the address of whatever they point at, answered under the name that
  holds the alias, which is how Route53 answers an alias. The alias record itself never appears.
- A name in a zone holding no record of the queried type gives `NOERROR` with no answers, and a name
  the zone does not hold gives `NXDOMAIN`. Both carry the zone `SOA` in the authority section, so a
  resolver knows how long it may cache the negative answer. If the zone holds no `SOA` of its own,
  one is synthesised.
- A name held by no hosted zone is `REFUSED` rather than `NXDOMAIN`: the simulator answers only for
  the zones it holds, and cannot claim a name exists nowhere.
- Zones from every simulated Account are answered, because DNS resolution is environment-wide.

Not modelled: EDNS0, the `ANY` query type, DNS over TCP, more than one question per query, recursion,
and DNSSEC. Answers are always authoritative.

## Local hostname resolution

When Yulin is served on localhost, Route53 can map your own test hostnames to simulated service
targets. Request the local server using the hostname plus the `sim-aws.localhost` suffix.

For example, if Route53 contains a record for `www.example.test`, request:

```text
http://www.example.test.sim-aws.localhost:<port>/
```

The local server resolves the logical hostname `www.example.test` through sim Route53 and routes the
request to the simulated target named by the record.

The suffix is optional. It exists so a client can reach the local server without the hostname
resolving on the public internet, so it is only needed while nothing is resolving the name to the
simulator. Once a resolver is pointed at the served DNS server, as under [Ports](#ports) above, the
name resolves on its own and the request can be made under the hostname your application really
uses:

```text
http://www.example.test:<port>/
```

Both forms reach the same simulated target. The suffix-free form is what makes an exact apex `Host`
possible, so a CloudFront Function redirecting `example.test` to `www.example.test` can be exercised
in a browser.

This is most useful with CloudFront aliases. You can create a CloudFront distribution, create a
Route53 record pointing at the distribution hostname, then fetch through your application hostname.

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

console.log(stack.outputs.get("HostedZoneId")?.value);
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
clearest option in templates because it can reference the zone resource directly.

### Unsupported record types in a template

A real DNS stack usually holds a few records that have nothing to do with what is being tested. When
one of them declares a [record type](#record-types) sim Route53 does not store, the RecordSet is
skipped and the rest of the stack deploys, the same way an unsupported resource type is. The skipped
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
the stack, so a `Name` that is not a string, a `Type` that is not a string, or a negative `TTL` is
refused. An unmodelled record type is a gap in the simulation; a malformed RecordSet is a broken
template.

Tearing the stack down works with the skipped RecordSet in it. Nothing was created for it, so the
teardown steps over it rather than asking Route53 to remove a record it never stored.

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
throughout its template rather than creating the zone. The template deploys as it is: the zone is
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

Each `SimAws` instance has its own isolated state, so you can create a fresh instance per test or
share one across related local setup.

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

A standalone `SimRoute53` instance has its own isolated state and is not connected to a wider
`SimAws` environment. Use `SimAws` when Route53 needs to resolve names to other simulated services.

## Available functionality

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
- A browser-viewable hosted zone and record summary at `dns.sim-aws.localhost`
- DNS answers over UDP for `A`, `AAAA`, `CNAME`, `TXT`, `NS` and `SOA`, so those records can be
  queried with `dig` or any DNS client
- The `AWS::Route53::HostedZone` and `AWS::Route53::RecordSet` CloudFormation resources, with a
  RecordSet declaring an unstored record type skipped rather than failing the stack
- CDK-created Route53 Hosted Zones and records in synthesized templates

The simulator focuses on useful behaviour for tests and local development rather than full Route53
feature parity. Unsupported Route53 options may be ignored or may throw errors depending on whether
the simulator needs them to model the requested behaviour.

## Limitations

Where sim Route53 knowingly behaves differently from AWS:

- **A RecordSet naming a Hosted Zone that does not exist creates one.** CloudFormation would refuse
  with `NoSuchHostedZone`, because the ID names a zone in an account the simulation is not. Every
  template built with `HostedZone.fromLookup` would then be undeployable here, so the zone is
  registered on demand instead. See
  [A zone a template names but does not create](#a-zone-a-template-names-but-does-not-create).
- **The name of such a zone is a guess.** Nothing in a synthesized template says what a looked-up
  zone is called, so the name is inferred from the records that reference it and is only as specific
  as they are. Register the zone yourself when a test depends on its name.
