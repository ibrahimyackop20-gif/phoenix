# Contributing to Phoenix Print

Thank you for your interest in contributing. This guide explains how to propose changes in a way that is easy to review and merge.

## Code of conduct

Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By contributing, you agree to uphold it.

## Ways to contribute

- Report bugs and suggest features (use issue templates)
- Improve documentation and screenshots
- Fix typos, accessibility, or i18n gaps
- Submit bug fixes and carefully scoped features
- Review pull requests

## Before you start

1. Search [existing issues](https://github.com/ibrahimyackop20-gif/phoenix/issues) and pull requests to avoid duplicates.
2. For larger features, open an issue first so maintainers can align on scope.
3. Never commit secrets (`.env`, keystores, service-role keys, private credentials).

## Development setup

```bash
git clone https://github.com/ibrahimyackop20-gif/phoenix.git
cd phoenix
npm ci
cp .env.example .env
# Fill EXPO_PUBLIC_* values for your own Supabase project
# For Android push notifications:
#   cp google-services.json.example google-services.json
#   then paste your Firebase Android config into google-services.json
npx expo start
```

See the [README](README.md) for environment variables, Android/iOS builds, and architecture.

### Useful commands

| Command | Purpose |
|---------|---------|
| `npx expo start` | Start Metro / Expo Dev Tools |
| `npx expo run:android` | Local Android native build |
| `npx expo run:ios` | Local iOS native build |
| `npm run lint` | ESLint via Expo |

## Branching

- `main` — stable default branch
- Create feature branches from `main`:
  - `fix/<short-description>`
  - `feat/<short-description>`
  - `docs/<short-description>`
  - `chore/<short-description>`

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add order receipt share sheet
fix: prevent duplicate Android versionCode in CI
docs: document GitHub Actions release secrets
chore: refresh issue templates
```

Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`.

## Pull requests

1. Keep PRs focused — one concern per PR when possible.
2. Fill out the pull request template.
3. Include screenshots or screen recordings for UI changes.
4. Note any migration or env changes clearly.
5. Do not change application behavior in documentation-only PRs (and vice versa) unless intentional.
6. Ensure the app still starts locally for the paths you touched.

### Review expectations

Maintainers may ask for:

- Smaller diffs or clearer commit history
- Tests or manual verification notes
- Docs updates for user-facing changes

## Reporting bugs

Use the **Bug report** issue template and include:

- Steps to reproduce
- Expected vs actual behavior
- Platform (Android / iOS / web), Expo / OS versions
- Logs or screenshots (redact tokens and personal data)

## Security

Report vulnerabilities privately via [SECURITY.md](SECURITY.md). Do not disclose exploits in public issues.

## License

By contributing, you agree that your contributions are licensed under the same [MIT License](LICENSE) that covers this project.
