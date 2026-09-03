# AI skill for Yulin

The `yulin-aws-simulation` skill gives coding agents instructions for using Yulin in tests and local
development.

## Install the skill

Install it in the current project's `.agents/skills/` directory:

```bash
npx @kensio/skills add yulin-aws-simulation
```

Codex CLI, Cursor, VS Code, and Gemini CLI read skills from that directory. To install the skill for
Claude Code, add `--agent claude`. Add `--user` to install it for every project under your user
account.

Claude Code can also install the skill from the Kensio plugin marketplace:

```bash
claude plugin marketplace add KensioSoftware/kensio.ai
claude plugin install yulin-aws-simulation@kensio
```

The skill is also published as the `@kensio/yulin-aws-simulation` npm package. Each
[kensio.ai release](https://github.com/KensioSoftware/kensio.ai/releases) includes a zip archive for
installations that cannot reach a package registry.

## What the skill teaches

The skill tells an agent how to:

- use `SimAws` and `SimSdk` directly
- deploy the same synthesized CDK template in tests and local development
- choose between deploying a resource and registering one directly
- intercept AWS SDK clients without keeping separate hand-written stubs
- control simulated time
- inspect simulated state in assertions
- match simulated service errors by `name`
- share an expensive deployment across tests in one file
- invoke code through a simulated Lambda function with its configured role and environment
- treat unsupported behaviour as a gap to report, not behaviour to guess

## Give the agent access to the API docs

The skill covers testing choices. The service guides document Yulin's APIs and supported AWS
behaviour.

The skill points agents to [yulinsim.dev/llms.txt](https://yulinsim.dev/llms.txt). That file indexes
plain Markdown versions of every guide on the documentation site. Append `llms.txt` to a page URL to
read that page as Markdown.

The npm package includes the same documentation under `node_modules/@kensio/yulin/docs/`. Its index
is `node_modules/@kensio/yulin/llms.txt`. These files match the installed Yulin version and remain
available without network access. Some search tools skip `node_modules` unless the path is given
explicitly.

## Limitations

- The skill does not replace the service guides. An agent still needs the relevant guide when it
  works with a service command, event shape, or limitation.
- The skill is versioned separately from Yulin. The documentation included in the installed Yulin
  package is the reference for that package version.

The skill source is available at
[kensio.ai/skills/yulin-aws-simulation](https://kensio.ai/skills/yulin-aws-simulation) under the
Apache-2.0 licence.
