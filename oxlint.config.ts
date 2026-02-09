import { defineConfig } from "oxlint";
import { oxlint } from "@kingsword/lint-config/config";

export default defineConfig(
  oxlint({
    profile: "lib",
    test: "none",
    level: "recommended",
    extra: {
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
);
