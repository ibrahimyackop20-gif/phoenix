# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| `1.x` (main branch) | Yes |
| Older / untagged forks | Best effort |

Security fixes are applied to the latest `main` branch first.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, email the maintainer:

**ibrahimyackop20@gmail.com**

Include as much detail as you can:

- Description of the issue and potential impact
- Steps to reproduce or a minimal proof of concept
- Affected components (mobile client, Supabase RLS, Edge Functions, CI, etc.)
- Your preferred contact method for follow-up

You should receive an acknowledgement within **7 days**. After triage we will share a plan (fix, disclosure timeline, or reason for declining).

## Safe harbor

We welcome good-faith security research. Please:

- Avoid privacy violations, data destruction, and service disruption
- Do not access or modify data that is not yours
- Give us reasonable time to remediate before public disclosure

## Secrets and credentials

If you discover leaked credentials in this repository or its history (API keys, service-role keys, keystores, `.env` files, webhook secrets):

1. Report them privately using the contact above
2. Assume they may already be compromised — **rotate** them in Supabase, Google Cloud, Firebase, Telegram, and CI
3. Do not paste live secrets into issues or pull requests

Contributors must never commit:

- `.env` / private env files
- Android keystores (`.jks`, `.keystore`)
- Apple certificates / provisioning profiles
- Supabase **service role** keys
- Bot tokens, SMTP passwords, or webhook secrets
- Project-specific `google-services.json` (use `google-services.json.example` only)

Use `.env.example`, `google-services.json.example`, and `supabase/secrets.example` as templates only.

## Client vs server keys

`EXPO_PUBLIC_*` values are embedded in the mobile app and are **not** secret by themselves. Protect the backend with Row Level Security (RLS), careful Storage policies, and server-only secrets in Supabase / CI.

Firebase Android API keys inside `google-services.json` are client identifiers. They are often restricted by package name / SHA-1, but they still identify your Firebase project — **do not commit** the real file to a public repository. Prefer CI secret `GOOGLE_SERVICES_JSON_BASE64` and rotate the key if it was ever published.

## Preferred disclosure

Coordinated disclosure is preferred. We appreciate researchers who allow time for a fix before publishing details.
