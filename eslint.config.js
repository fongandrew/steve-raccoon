import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import html from 'eslint-plugin-html';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';

export default [
	{
		ignores: ['node_modules/**', '.netlify/**', 'dist/**', 'public/vendor/**'],
	},

	eslint.configs.recommended,

	{ linterOptions: { reportUnusedDisableDirectives: true } },

	{ files: ['public/**/*.html'], plugins: { html } },

	{
		files: [
			'public/**/*.{js,html}',
			'tests/**/*.js',
			'scripts/**/*.js',
			'relay/**/*.js',
			'*.js',
		],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: { ...globals.browser },
		},
		plugins: {
			'simple-import-sort': simpleImportSort,
			'unused-imports': unusedImports,
			prettier: prettierPlugin,
			...importPlugin.flatConfigs?.recommended.plugins,
		},
		rules: {
			'no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
				},
			],
			'unused-imports/no-unused-imports': 'error',
			'prefer-const': ['error', { destructuring: 'all' }],
			eqeqeq: 'error',
			'no-var': 'error',
			'no-implicit-globals': 'error',
			'import/no-cycle': ['error', { ignoreExternal: true }],
			'import/no-duplicates': 'error',
			'import/first': 'error',
			'import/newline-after-import': 'error',
			'simple-import-sort/imports': 'error',
			'simple-import-sort/exports': 'error',
			'prettier/prettier': 'error',
		},
	},

	{
		files: ['tests/**/*.js', 'scripts/**/*.js', 'relay/**/*.js', '*.js'],
		languageOptions: { globals: { ...globals.node } },
	},

	{
		files: ['public/sw.js'],
		languageOptions: { globals: { ...globals.serviceworker } },
	},

	prettierConfig,
];
