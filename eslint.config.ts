import js from '@eslint/js'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import type { ESLint, Linter, Rule } from 'eslint'
import { globalIgnores } from 'eslint/config'
import pluginVue from 'eslint-plugin-vue'

const directivePattern = /^\s*(\/\s*<reference|@vite-ignore|@ts-|eslint-|prettier-)/

const noComments: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    messages: {
      forbidden: 'Comments are not allowed; express intent through naming and structure.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (directivePattern.test(comment.value)) {
            continue
          }
          if (comment.loc) {
            context.report({ loc: comment.loc, messageId: 'forbidden' })
          }
        }
      },
    }
  },
}

const conventions: ESLint.Plugin = {
  rules: { 'no-comments': noComments },
}

const restrictImports = (files: string[], forbidden: string[], message: string): Linter.Config => ({
  files,
  rules: {
    'no-restricted-imports': ['error', { patterns: [{ group: forbidden, message }] }],
  },
})

const frameworkPackages = ['vue', 'vue/*', 'pinia', 'vue-i18n']

export default defineConfigWithVueTs(
  { name: 'app/files-to-lint', files: ['**/*.{ts,mts,tsx,vue}'] },
  globalIgnores(['**/dist/**', '**/coverage/**', '**/public/wasm/**', '**/cpp/build*/**']),
  js.configs.recommended,
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  {
    name: 'app/conventions',
    plugins: { conventions },
    rules: {
      'conventions/no-comments': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',
      'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
      'vue/define-macros-order': [
        'error',
        { order: ['defineProps', 'defineEmits', 'defineModel'] },
      ],
    },
  },
  restrictImports(
    ['src/core/**'],
    ['@/engine/*', '@/formats/*', '@/app/*', '@/ui/*', '@/i18n/*', ...frameworkPackages],
    'core must stay framework-free and independent from upper layers',
  ),
  restrictImports(
    ['src/engine/**'],
    ['@/formats/*', '@/app/*', '@/ui/*', '@/i18n/*', ...frameworkPackages],
    'engine may depend only on core',
  ),
  restrictImports(
    ['src/formats/**'],
    ['@/app/*', '@/ui/*', '@/i18n/*', ...frameworkPackages],
    'formats may depend only on core and engine',
  ),
  restrictImports(['src/app/**'], ['@/ui/*'], 'application layer must not depend on UI components'),
  skipFormatting,
)
