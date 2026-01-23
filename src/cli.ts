#!/usr/bin/env node
import bin from "tiny-bin";
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
    .run();
}

void main();
