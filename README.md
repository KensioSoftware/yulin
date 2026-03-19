# yulin

AWS system behaviour simulation for isolated unit testing

## Installation

```bash
npm i -D @kensio/yulin
```

## Usage

Still in alpha!

## What is yulin?

TLDR: yulin is an AWS simulator for testing Node.js applications.

The simulation is not only local to the machine, but in the same single process
with the test and application under test. No network or external i/o is
involved. This is what "isolated" refers to.

This "isolated system" approach to testing has a few advantages:

 - Tests run fast as everything is in memory with no real networking.
 - Test set-up is fast and uncomplicated, as there are no containers or extra
   dependencies to manage.
 - It's straightforward to use multiple other mocks and simulators alongside
   yulin, such as [nock](https://github.com/nock/nock), as yulin makes no
   assumptions about the environment.
 - You can control everything in each isolated test process, such as controlling
   the current time, even when multiple different AWS services are simulated.
 - One test can cover **meaningful system behaviour** across multiple AWS
   services and applications, such as Lambdas sending events to SQS queues to be
   picked up by other Lambdas, or DynamoDB streams triggering Lambdas.

That last point is the most important. The motivation behind yulin is to enable
efficient tests that cover the logical behaviour of a system. That is in
contrast to less valuable microscopic unit tests with fiddly mocks and brittle
assertions. The goal of yulin is to allow you to test system behaviours that are
meaningful to users and stakeholders.

## What's in a name?

The word yǔlín (雨林) is Chinese for "rainforest". This is a roundabout reference
to "Amazon" as in Amazon Web Services.

## Development

Install pnpm

```bash
pnpm i
```
