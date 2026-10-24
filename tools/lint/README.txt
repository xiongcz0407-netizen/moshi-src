发布前检查「没定义的变量」（比如一行代码被注释吃掉）：
  mkdir -p /tmp/lint && cd /tmp/lint && npm init -y && npm i eslint@9 globals@15
  cp <项目>/tools/lint/eslint.config.mjs . && rm -rf src && cp -R <项目>/src/js src && npx eslint -c eslint.config.mjs src/*.js
error 必须是 0。
