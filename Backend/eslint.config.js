import js from '@eslint/js'
import globals from 'globals'

export default [
    { ignores: ['prisma/generated/**', 'node_modules/**'] },
    {
        files: ['**/*.js'],
        ...js.configs.recommended,
        languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': ['error', { argsIgnorePattern: '^_|^next$', varsIgnorePattern: '^_', caughtErrors: 'none' }]
        }
    }
]
