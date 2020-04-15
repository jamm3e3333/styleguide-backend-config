<div align="center">

# Ackee styleguide: Backend config

Configuration files for [styleguide](https://github.com/AckeeCZ/styleguide) enforcement tools

</div>

## Setup
```
npm i -D git+ssh://git@github.com:AckeeCZ/styleguide-backend-config.git 
```

## ESLint
`.eslintrc.js`
```js
module.exports = require('styleguide-backend-config/dist/eslint')
```
```jsonc
{
    // npm tasks
    "cs:eslint:check": "eslint --ignore-path .gitignore '**/*.ts' -f codeframe",
    "cs:eslint:fix": "npm run cs:eslint:check -- --fix",
}
```

For detailed rules description, see [eslint](./eslint.md)
## Prettier
`npm install -D prettier`

`prettier.config.js`
```js
module.exports = require('styleguide-backend-config/dist/prettier')
```

```jsonc
{
    // npm tasks
    "cs:prettier:check": "prettier --ignore-path .gitignore --check '**/*.{ts,js,json,md}'",
    "cs:prettier:fix": "npm run cs:prettier:check -- --write '**/*.{ts,js,json,md}'",
}
```

## Husky
`.huskyrc.json`
```json
{
  "hooks": {
    "pre-commit": "lint-staged",
    "commit-msg": "commitlint -E HUSKY_GIT_PARAMS"
  }
}
```

`.lintstagedrc`
```json
{
  "*.ts": ["prettier --write", "eslint --fix"],
  "*.{ts,js,json,md}": "prettier --write"
}

```

## License

This project is licensed under [MIT](./LICENSE).
