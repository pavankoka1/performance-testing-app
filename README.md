# PerfTrace

PerfTrace is a web-based performance testing tool that launches a visible Playwright-powered Chromium session so you can manually interact with a target URL and generate a detailed performance report.

## Features

- Launch a non-headless Chromium window for manual interaction.
- Capture Playwright tracing data (screenshots, snapshots, sources).
- Parse trace data into FPS, CPU/GPU busy time, memory, DOM nodes, layout/paint, long tasks, render phases, and network metrics.
- Visualize metrics with interactive charts and tables.
- Generate bottleneck suggestions after each run.

## Local Setup

```bash
npm install
npx playwright install chromium
npm run dev
```

Open `http://localhost:3000` and paste a target URL.

## Recording Workflow

1. Paste the URL for the app you want to test.
2. Click **Launch & Start Recording** to open a visible Chromium window.
3. Interact with the app while the recording indicator is active.
4. Click **Stop Recording & Generate Report** to close the browser and process the trace.

## Configuration

- `PERFTRACE_HEADLESS=true` forces headless mode (useful in CI or serverless).
- When running on Vercel, the API route automatically switches to `@sparticuz/chromium` with headless mode.

## Deployment (Vercel)

PerfTrace is Vercel-ready. The API route uses the Node.js runtime and `@sparticuz/chromium` for bundle size and compatibility. Note that Vercel runs headless, so visible browser windows are only available locally.

```bash
npm run build
npm run start
```

## Scripts

- `npm run dev` - Start the Next.js dev server.
- `npm run build` - Build for production.
- `npm run start` - Start the production server.
- `npm run lint` - Run linting.
