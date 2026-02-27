#!/usr/bin/env node
import bin from "tiny-bin";
import { runAdd } from "./commands/add.ts";
import { runBump } from "./commands/bump.ts";
import { runCi } from "./commands/ci.ts";
import { runInit } from "./commands/init.ts";
import { runOxlint } from "./commands/oxlint.ts";
import { runOxfmt } from "./commands/oxfmt.ts";
import { runPackage } from "./commands/package.ts";

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
    .command("add", "Add a new package to an existing pnpm workspace")
    .argument("[name]", "Package name (directory name under packages/)")
    .option("--yes, -y", "Skip confirmations and use defaults")
    .action(async (options, args) => {
      await runAdd({ nameArg: args[0], yes: options.yes === true });
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
    .command("bump", "Bump package.json version")
    .argument("[target]", "patch | minor | major | <version>")
    .option("--dry-run", "Show the next version without writing package.json")
    .action(async (options, args) => {
      await runBump({ targetArg: args[0], dryRun: options.dryRun === true });
    })
    .command("pkg", "Normalize package.json for npm publishing using GitHub remote")
    .option("--yes, -y", "Skip confirmations and use defaults")
    .action(async (options) => {
      await runPackage({ yes: options.yes === true });
    })
    .run();
}

void main();
