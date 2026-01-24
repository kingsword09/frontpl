#!/usr/bin/env node
import bin from "tiny-bin";
import { runCi } from "./commands/ci.js";
import { runInit } from "./commands/init.js";

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
    .run();
}

void main();
