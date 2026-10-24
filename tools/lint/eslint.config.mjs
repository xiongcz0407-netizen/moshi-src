import globals from 'globals';
export default [{ files: ['**/*.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
  rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }], 'no-unreachable': 'error', 'no-dupe-keys': 'error', 'no-redeclare': 'error', 'no-self-assign': 'error', 'no-const-assign': 'error', 'no-use-before-define': ['error', { functions: false, classes: false, variables: false }],
    /* 设计 79：不用浏览器自带的确认框 / 提示框（iPhone 上会卡住画面、样子也不统一），一律用 UI.ask / UI.toast */
    'no-restricted-globals': ['error', ...['confirm', 'alert', 'prompt'].map(name => ({ name, message: '用 UI.ask / UI.toast' }))],
    'no-restricted-properties': ['error', ...['confirm', 'alert', 'prompt'].map(property => ({ object: 'window', property, message: '用 UI.ask / UI.toast' }))] } }];
