# CLAUDE.md

## Commands

```bash
npm ci        # install
npm test      # node --test, all tests
```

## Architecture

Data flows one way: school list → adapter → unified JSON → site.

- `schools/taipei.json`: one entry per school, naming its adapter (`nss`, or `null` when unsupported) and the adapter's parameters. Committed.
- `src/fetch/`: helpers (`format.js`), the polite HTTP client, one module per adapter under `adapters/`, and the run that fetches every school, keeps the previous data when a school fails, and writes `data/index.json` plus `data/<code>.json`. Fetched data is never committed; it is deployed to GitHub Pages with the app.
- `site/`: the PWA, plain JS with no build step. It only reads the unified format and knows nothing about school site systems.

Only read requests go to school sites. Times are ISO 8601 with `+08:00`. Never store posters' account fields (`owner`, `person`) or view counts.

Changes go through a PR; CI must be green; the owner merges.
