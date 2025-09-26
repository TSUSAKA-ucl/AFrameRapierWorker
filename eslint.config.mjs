// eslint.config.js
import globals from "globals";
import pluginJs from "@eslint/js";

export default [
  {
    languageOptions: {
      globals: globals.browser, // ブラウザ環境のグローバル変数を有効にする
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
  },
  pluginJs.configs.recommended, // ESLintの推奨ルールを適用する
  {
    rules: {
      'no-unused-vars': 'warn',
    }
  },
];
