# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Open-source community documentation (`CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY`, issue/PR templates)
- Professional README with banner and product screenshots under `docs/`
- `google-services.json.example` plus CI restore via `GOOGLE_SERVICES_JSON_BASE64`

### Changed

- Stopped tracking project-specific `google-services.json` (gitignored; optional for prebuild)

## [1.0.0] - 2026-07-21

### Added

- Expo SDK 54 React Native client for print shop customers and admins
- Supabase Auth, Postgres, Storage, Realtime, and Edge Functions integration
- Print order creation, tracking, cancel flow, and PDF receipts
- File upload for PDFs and images
- Push notifications for order and operational events
- Admin dashboard (orders, users, pricing, reports, and related screens)
- Arabic / English i18n and light / dark / system themes
- GitHub Actions workflows for Android preview APK and release AAB
- Automatic unique Android `versionCode` for Play Store uploads (`1000 + run_number`)

### Security

- Client configuration via `EXPO_PUBLIC_*` environment variables
- Example templates for local env and server secret names (no live secrets in templates)

[Unreleased]: https://github.com/ibrahimyackop20-gif/phoenix/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ibrahimyackop20-gif/phoenix/releases/tag/v1.0.0
