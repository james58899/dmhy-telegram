workflow "ESLint" {
  on = "push"
  resolves = ["Run ESLint"]
}

action "Init" {
  uses = "docker://node"
  runs = "yarn"
}

action "Run ESLint" {
  uses = "docker://node"
  needs = ["Init"]
  runs = "yarn"
  args = "eslint"
}
