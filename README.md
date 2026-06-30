# Hello Stanford OHS parent!

This is an open source project for interested parents to build software that supports our kids at OHS.

If that describes you, please DM DROdio on the Tech Pixel Parents WhatsApp group.

If you aren't in that group, but you're a parent of a child at OHS, please reach out through the signup form at https://pixelparents.org.

Looking forward to building some great software with you.

## Contributing with Claude Code

You don't need to be a full-time engineer to contribute — [Claude Code](https://www.anthropic.com/claude-code) can read the whole project for you and get you building in minutes.

**Prerequisites:** [Node.js](https://nodejs.org) and the Claude Code CLI (`npm install -g @anthropic-ai/claude-code`).

```bash
git clone https://github.com/drodio/pixelparents.git
cd pixelparents
claude -p "Read CLAUDE.md and AGENTS.md in full and treat them as binding instructions for this repo. Then explore the codebase — the routes in app/, the modules in lib/, the database schema in lib/db/schema, and the developer API under app/api — to understand how Pixel Parents is built. When you're done, give me a short summary of what the project does and how it's organized, confirm you've understood the working conventions in CLAUDE.md and AGENTS.md (the feature-branch + PR workflow, the per-branch PRD progress log, and the strict no-PII / no-secrets rules), and tell me you're ready to start building."
```

Claude will read the project's conventions, explore the code, and report back that it understands the repo and is ready to build with you. From there, just tell it what you'd like to add — it follows the branch → commit → PR workflow documented in `CLAUDE.md`.

> New to Claude Code? Drop the `-p` flag (`claude`) to start an interactive session you can keep chatting in.

### Prefer a desktop app?

If you'd rather not live in a terminal, download the [Claude desktop app](https://claude.ai/download) for Mac or Windows. Once it's installed and you've set up Claude Code (the CLI above), you can run Claude Code directly inside the desktop app and build on this repo without the command line — handy if a terminal feels unfamiliar.

## Pixel Parents API

Pixel Parents has a small developer API that exposes **high-level, non-PII community stats** — counts and taxonomies only (signups by state, skillset, tech depth, grade, interests, and more), never names, emails, phones, or photos. It's a safe, fun dataset to build on: a community dashboard, a data viz, a school project, or querying the community from an AI agent.

- **Docs & endpoints:** https://pixelparents.org/developers
- **Request access** (OHS families only): use the **Request API access** button on that page.

Once approved, authenticate with `Authorization: Bearer <your-key>`. Encourage your kid(s) to code — or vibe-code — something fun with it!
