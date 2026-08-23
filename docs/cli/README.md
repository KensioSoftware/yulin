# AWS CLI

The real `aws` CLI reaches a served simulated environment over a local endpoint URL, and twenty of
Yulin's twenty-five SDK-facing services answer it.

[Serving on localhost](https://yulinsim.dev/serve/) is the reference for what each service serves. This page
covers the way in from a shell.

## An endpoint and a key to sign with

Serving binds a simulated environment to a port. A served request runs as whoever signed it, and the
access key to sign the first one comes from simulated IAM in the process that built the environment:

```typescript sim-cli-endpoint
/**
 * Serving a simulated environment for the aws CLI to reach.
 */

import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const simIam = simAws.iam();

await simIam.createUser(new CreateUserCommand({ UserName: "Operator" }));
await simIam.putUserPolicy(
  new PutUserPolicyCommand({
    UserName: "Operator",
    PolicyName: "Everything",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "*", Resource: "*" },
    }),
  }),
);
const created = await simIam.createAccessKey(
  new CreateAccessKeyCommand({ UserName: "Operator" }),
);

const srv = await serveSimAws({ simAws, port: 8787 });

// Paste these into the shell the CLI runs in.
console.log(`export AWS_ENDPOINT_URL=http://localhost:${srv.port}`);
console.log(`export AWS_ACCESS_KEY_ID=${created.AccessKey.AccessKeyId}`);
console.log(
  `export AWS_SECRET_ACCESS_KEY=${created.AccessKey.SecretAccessKey}`,
);
console.log(`export AWS_DEFAULT_REGION=${simAws.defaultRegionName}`);
```

Pin the port when the URL has to stay the same between runs. Without one the server takes whatever
is free.

## Configuring the CLI

Four environment variables are the whole configuration:

```bash
export AWS_ENDPOINT_URL=http://localhost:8787
export AWS_ACCESS_KEY_ID=AKIAVEXOWARWMKBOA0MP
export AWS_SECRET_ACCESS_KEY=RzIvKRp1sd5yXfEifA1twsUTd4GlHL5JpzvECpox
export AWS_DEFAULT_REGION=us-east-1
```

`sts get-caller-identity` is the call to check the wiring with. It reports the principal behind the
key that signed the request:

```bash
aws sts get-caller-identity
{
    "UserId": "AIDARNFLISEC7SCUNSDY",
    "Account": "888888888888",
    "Arn": "arn:aws:iam::888888888888:user/Operator"
}
```

The credentials have to come from simulated IAM. Any other key is refused with `403 Forbidden`, and
an unsigned request reaches nothing.

A Region is required, as it is against real AWS. Changing it moves the CLI between simulated
Regions, and a Queue created under `eu-west-2` is invisible to `AWS_DEFAULT_REGION=us-east-1`.

### A named profile instead

A profile in the CLI's own config file carries the same four values. The simulation then stays out
of the ambient environment:

```ini
[profile sim]
region = us-east-1
endpoint_url = http://localhost:8787
aws_access_key_id = AKIAVEXOWARWMKBOA0MP
aws_secret_access_key = RzIvKRp1sd5yXfEifA1twsUTd4GlHL5JpzvECpox
```

`aws --profile sim sts get-caller-identity` then reaches the simulation while a bare `aws` still
goes to real AWS. The profile has to carry credentials of its own. Once `--profile` is given the CLI
stops reading `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` from the environment.

`role_arn` and `source_profile` work too. The CLI assumes the simulated Role for itself and signs
with the session it gets back:

```ini
[profile reader]
region = us-east-1
endpoint_url = http://localhost:8787
role_arn = arn:aws:iam::888888888888:role/Reader
source_profile = sim
```

## Building the rest of the identities from the shell

Only the first key has to come from the process that built the simulation. `aws iam` builds
everything after it:

```bash
aws iam create-user --user-name shopper
aws iam put-user-policy --user-name shopper --policy-name read-buckets \
  --policy-document '{"Version":"2012-10-17","Statement":{"Effect":"Allow","Action":"s3:ListAllMyBuckets","Resource":"*"}}'
aws iam create-access-key --user-name shopper
```

`create-access-key` answers with the secret once. Signing with the new key reports the new User, and
simulated IAM authorizes every request against the policy it was given:

```bash
aws s3api create-bucket --bucket nope

aws: [ERROR]: An error occurred (AccessDenied) when calling the CreateBucket operation: User:
arn:aws:iam::888888888888:user/shopper is not authorized to perform: s3:CreateBucket on resource:
arn:aws:s3:::nope
```

`aws sts assume-role` answers with temporary credentials. Export the three values it returns and the
rest of the session runs as the Role:

```bash
aws sts assume-role --role-arn arn:aws:iam::888888888888:role/Reader --role-session-name probe
export AWS_ACCESS_KEY_ID=ASIAKBEUIHDMON9VBZXF
export AWS_SECRET_ACCESS_KEY=jm2N56vfVtLgJEo11OtbIXbgnJBgxpUMrszPrQdl
export AWS_SESSION_TOKEN=11568oBDksY9czECUMiAWk9tzmvG7zlQNjtLI1WmhZFS...
```

The expiry is stamped from the simulation's own clock, and
[advancing it](https://yulinsim.dev/time/) past the expiry stops the session authenticating.

## What answers

Twenty simulated services answer the endpoint. S3, STS, IAM, ELBv2, SNS, CloudFormation and Lambda,
along with the AWS JSON protocol services: DynamoDB, DynamoDB Streams, SQS, Cognito Identity
Provider, EventBridge, ECS, SSM, ACM, CloudWatch, CloudWatch Logs, KMS, Secrets Manager and
Rekognition.

A quick tour of the ones a shell reaches for most:

```bash
aws s3 cp ./index.html s3://widgets/index.html
aws s3 sync ./site s3://widgets/site/
aws dynamodb put-item --table-name widgets --item '{"id":{"S":"w1"}}'
aws sqs create-queue --queue-name orders
aws ssm get-parameter --name /shop/url --query 'Parameter.Value' --output text
aws secretsmanager get-secret-value --secret-id shop/db --query SecretString --output text
aws logs describe-log-groups --query 'logGroups[].logGroupName' --output text
```

`--query`, `--output text` and the rest of the CLI's own machinery work throughout, because they run
client-side over an ordinary AWS response.

[The serve docs](https://yulinsim.dev/serve/#which-services-answer) list the operations each service
implements. Anything outside those lists is refused as `NotImplemented`.

## CLI traps

Each of these is CLI behaviour, and each catches people out against real AWS too. They are collected
here because a simulated endpoint is often where someone meets them first.

### `--payload` needs `--cli-binary-format`

CLI v2 reads `--payload` as base64 by default:

```bash
aws lambda invoke --function-name orders --payload '{"id":1}' out.json

aws: [ERROR]: Invalid base64: "{"id":1}"
```

Pass `--cli-binary-format raw-in-base64-out` and the same call runs the function:

```bash
aws lambda invoke --function-name orders --payload '{"id":1}' \
  --cli-binary-format raw-in-base64-out out.json
cat out.json
```

`--invocation-type Event` answers `202` and runs the handler on the background scheduler. A script
reading what the function did waits on `simAws.backgroundTasksComplete()` first.

### S3 addressing style

The CLI needs nothing here. Its default `auto` style sends path-style requests to a custom endpoint,
which is what this endpoint routes. An SDK client is the one that needs `forcePathStyle: true`.

Forcing `addressing_style = virtual` in the config file breaks it. The Bucket moves into a hostname
the endpoint has no route for, and `list-objects-v2` comes back empty while `head-object` comes back
`404`.

### `aws cloudformation deploy` uses change sets

`deploy` is a CLI-side wrapper over `CreateChangeSet`, and simulated CloudFormation implements four
operations that do not include it:

```bash
aws cloudformation deploy --stack-name site --template-file template.json

aws: [ERROR]: An error occurred (NotImplemented) when calling the CreateChangeSet operation:
Simulated CloudFormation does not serve CreateChangeSet
```

`create-stack` and `describe-stacks` do work. A deployment starts in the background and
`create-stack` is answered before the Resources exist, as real CloudFormation answers it.

### Presigning needs the S3 service hostname

`aws s3 presign` signs whatever endpoint the CLI is configured with, and a URL built over the
general endpoint has no Bucket in it for the endpoint to route on. Point the one command at
simulated S3's own hostname on the served port:

```bash
aws --endpoint-url http://s3.us-east-1.sim-aws.localhost:8787 s3 presign s3://widgets/one.txt
```

The URL that comes back is fetchable by anything, including `curl` and a browser. The same hostname
serves [presigned URLs built by the SDK](https://yulinsim.dev/services/s3/#presigned-urls).

### A bad key looks like an XML parse failure

STS, IAM and ELBv2 speak the AWS Query protocol and expect an XML body. The endpoint answers a
rejected signature as JSON. The CLI reports the body it could not parse:

```bash
aws sts get-caller-identity

aws: [ERROR]: Unable to parse response (not well-formed (invalid token): line 1, column 0), invalid
XML received. Further retries may succeed:
b'{"Message":"Forbidden"}'
```

`Forbidden` in the quoted body is the real answer. The other seventeen services report the same
rejection as a plain `403`.

## Limitations

- Five services are refused with `501 Not Implemented`. Route 53 and CloudFront speak REST-XML, and
  API Gateway v2, SES v2 and EventBridge Scheduler speak REST-JSON. Every one of them is reachable
  in process through `SimAws` and through [SDK interception](https://yulinsim.dev/sdk/). Simulated ECR is
  refused the same way and has no AWS API surface at all, since its images are registered in
  process.
- An operation a served service has not implemented is refused as `NotImplemented`. That is a
  separate answer from the protocol refusal above. `aws iam list-users` reports
  `Simulated IAM does not serve ListUsers`, and `aws lambda list-functions` names the path it
  arrived at.
- `aws cloudwatch get-metric-statistics` and `aws cloudwatch get-metric-data` fail with
  `TypeError: time.getTime is not a function`. The JSON protocol carries a timestamp as epoch
  seconds and the endpoint hands that number to the simulation where a `Date` is expected. Both
  reads work in process and through SDK interception. `put-metric-data` and `list-metrics` are
  unaffected.
- `aws s3 cp` and `aws s3 sync` corrupt a **download** above the CLI's 8MB threshold
  ([#717](https://github.com/KensioSoftware/yulin/issues/717)). The CLI splits
  the download into ranged GETs, simulated S3 ignores `Range` and returns the whole Object for each
  one, and the parts land on top of each other. A 12MB Object arrives as a 20MB file. Uploads above
  the threshold are fine, and so is any download under it. Two ways round it, both verified.
  `aws s3api get-object` issues one unranged GET. Raising the threshold in the config file keeps
  `aws s3 cp` on a single GET too.

  ```ini
  [profile sim]
  s3 =
    multipart_threshold = 5GB
  ```
