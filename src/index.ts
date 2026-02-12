export { runCi } from "./commands/ci.ts";
export { runInit } from "./commands/init.ts";
export { runOxlint } from "./commands/oxlint.ts";
export { runOxfmt } from "./commands/oxfmt.ts";
export {
  githubCliCiWorkflowTemplate,
  githubDependabotTemplate,
  oxlintConfigTemplate,
  packageJsonTemplate,
} from "./lib/templates.ts";
