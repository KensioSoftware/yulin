# AI skill

Yulin has an AI skill that teaches a coding agent how to test AWS code with the simulator well. It
is `yulin-aws-simulation`, a `SKILL.md` written to the
[Agent Skills specification](https://agentskills.io/specification) and installable into Claude Code,
Codex CLI, Cursor, VS Code and anything else that reads one. It covers the part that lives outside
the API.

These docs and the skill answer different questions. A page here says what a simulated service does
and what its commands take. The skill says what to do with that. An AI agent reaching for Yulin
without it tends to build a harness around the simulator, leave hand-rolled stubs in place beside
it, or write an `instanceof` check against an SDK exception class that passes in production and
fails against the simulation.

## Install

```bash
npx @kensio/skills add yulin-aws-simulation
```

That copies the skill into `.agents/skills/`, the directory Codex CLI, Cursor, VS Code and Gemini
CLI read. `--agent claude` puts it in `.claude/skills/`, and `--user` installs it under your home
directory for every project.

As a Claude Code plugin:

```bash
claude plugin marketplace add KensioSoftware/kensio.ai
claude plugin install yulin-aws-simulation@kensio
```

It is also on npm as `@kensio/yulin-aws-simulation`, and every
[kensio.ai release](https://github.com/KensioSoftware/kensio.ai/releases) carries it as a zip for a
machine with no registry reach.

## What it covers

- Using `SimAws` and `SimSdk` directly, and spotting the helper class or `setupSimulatedAws()`
  wrapper that starts to grow around them.
- One synthesized CDK template behind the tests, the dev server and production, deployed with
  `deployTemplateFile` or `deployCdkOut`.
- When to register a resource at a chosen id, and when to deploy the stack that creates it.
- Interception over hand-rolled stubs, down to the requests a fake accepts and the simulation
  refuses.
- Freezing the clock, then advancing it on purpose.
- Assertions that read the simulation back.
- Why service errors match by `name` and not by `instanceof`.
- Deploying an expensive stack once per test file.
- Running a handler as a real simulated Lambda, under its execution role, its declared environment
  and its own log group.
- Refusals as a feature, and gaps raised upstream.

## Reading the API alongside it

The skill sends the AI agent to these docs for anything API-shaped, and
[llms.txt](https://yulinsim.dev/llms.txt) is the index it uses. Every page here is available as
plain markdown by appending `llms.txt` to its URL, one file per guide and one per simulated service.
That index works with or without the skill installed.

The same pages ship inside the package. An installed project holds them under
`node_modules/@kensio/yulin/docs/`, indexed by `node_modules/@kensio/yulin/llms.txt`, and they
document the version in that package rather than the current release. An agent with no network
reach has them, and so does one working on a project held a few versions back. Ripgrep and most
editor search skip `node_modules` by default. An agent finds these files when something names the
path for it.

The skill lives at
[kensio.ai/skills/yulin-aws-simulation](https://kensio.ai/skills/yulin-aws-simulation), versioned
separately from Yulin and licensed Apache-2.0.
