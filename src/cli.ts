#!/usr/bin/env node
import bin from "tiny-bin";
import { runCi } from "./commands/ci.ts";
import { runInit } from "./commands/init.ts";
import { runOxlint } from "./commands/oxlint.ts";
import { runOxfmt } from "./commands/oxfmt.ts";

async function main() {
  await bin("frontpl", "Scaffold standardized frontend templates")
    .argument("[name]", "Project name (directory name)")
    .action(async (_options, args) => {
      await runInit({ nameArg: args[0] });
    })
    .command("init", "Scaffold a new project")
    .argument("[name]", "Project name (directory name)")
    .action(async (_options, args) => {
      await runInit({ nameArg: args[0] });
    })
    .command("ci", "Add CI/release workflows to an existing project")
    .action(async () => {
      await runCi();
    })
    .command("oxlint", "Add/migrate linter to oxlint in current project")
    .option("--yes, -y", "Skip confirmations and use defaults")
    .action(async (options) => {
      await runOxlint({ yes: options.yes === true });
    })
    .command("oxfmt", "Add/migrate formatter to oxfmt in current project")
    .option("--yes, -y", "Skip confirmations and use defaults")
    .action(async (options) => {
      await runOxfmt({ yes: options.yes === true });
    })
    .run();
}

void main();
