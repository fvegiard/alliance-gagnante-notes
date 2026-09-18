# Alliance Gagnante — Francis Végiard Dev

Punk-styled full-stack personal notes app. Markdown + wiki links, D3 swarm knowledge graph, built-in Kimi AI agent, credentials vault, AI connectors (give any AI read access to your notes with a token), folders with AI auto-organization, and a companion Windows desktop widget.

## Stack

- React 19 + TypeScript + Vite + Tailwind + shadcn/ui
- tRPC 11 + Hono + Drizzle ORM + MySQL
- Kimi OAuth 2.0
- D3.js knowledge graph with folder/tag swarm clustering

## Run

```bash
cp .env.example .env   # fill in values
npm ci
npm run db:push
npm run dev
```

## Features

- 📝 Markdown notes with [[wiki links]]
- 📁 Folders + ✦ AI Organize (Kimi sorts notes into folders with tags)
- 🕸️ Swarm knowledge graph clustered by folder/tag
- ✦ Note Agent — scans for keys/tasks/links, AI-powered digests
- 🔌 AI Connectors — register any AI, copy-paste instructions give it read access via token
- ▱ Calque — draggable overlay rectangle for framing text
- 🖥️ Desktop widget (Electron) with headless AI — see `widget/` if included
