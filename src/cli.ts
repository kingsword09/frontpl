#!/usr/bin/env node
import bin from "tiny-bin";
import { runCi } from "./commands/ci.js";
import { runInit } from "./commands/init.js";
import { runOxfmt } from "./commands/oxfmt.js";

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
    .command("oxfmt", "Add/migrate formatter to oxfmt in current project")
    .option("--yes, -y", "Skip confirmations and use defaults")
    .action(async (options) => {
      await runOxfmt({ yes: options.yes === true });
    })
    .run();
}

void main();
