import { defineConfig } from "vite-plus";
import { oxlint } from "@kingsword/lint-config/config";

export default defineConfig({
  lint: oxlint({
    profile: "lib",
    test: "none",
    level: "recommended",
    extra: {
      options: {
        typeAware: true,
        typeCheck: true,
      },
      overrides: [
        {
          files: ["src/**/*.ts", "src/**/*.tsx"],
          rules: {
            "@kingsword/filename-match-export": "off",
            "@kingsword/types-file-organization": "off",
            "@kingsword/constants-file-organization": "off",
            "@kingsword/errors-file-organization": "off",
            "@kingsword/enum-file-organization": "off",
            "@kingsword/test-utils-organization": "off",
            "@kingsword/test-file-location": "off",
            "@kingsword/no-exported-function-expressions": "off",
            "@kingsword/no-exported-string-union-types": "off",
          },
        },
      ],
    },
  }),
  fmt: {
    useTabs: false,
    indentWidth: 2,
    lineWidth: 100,
    trailingComma: "all",
    semi: true,
    singleQuote: false,
    arrowParens: "always",
  },
  pack: {
    entry: {
      cli: "src/cli.ts",
      index: "src/index.ts",
    },
    format: ["esm"],
    target: "node22",
    clean: true,
    dts: true,
    shims: true,
  },
});
