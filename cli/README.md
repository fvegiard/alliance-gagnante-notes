# ⌨️ Note Agent CLI

Invoke the note agent from any terminal — it runs the full server-side chain
(**NVIDIA K3 → your local Ollama → Kimi**) over your notes, using nothing but a
connector token.

## Setup

1. `npm i -g tsx` (or just use `npx tsx`)
2. In the app, open the **Connections** page and create a connector — copy its
   `agc_…` token.
3. `cp cli/config.example.json cli/config.json`, then fill in:

   ```json
   { "apiUrl": "https://your-published-app (or http://localhost:3000)", "token": "agc_…" }
   ```

## Usage

```bash
npx tsx cli/agent.ts "organize my notes"
npx tsx cli/agent.ts "find every API key in my notes"
```

Prints the model actually used (`⚡ <nvidia-model>` or `🦙 ollama/<model>`) and
the answer.

## Shell-wrapping from Ollama land

If you live in `ollama run …` anyway, wrap the CLI so the note agent is one
keystroke away.

**PowerShell alias:**

```powershell
function Invoke-NoteAgent { npx tsx C:\path\to\app\cli\agent.ts $args }
# then:
Invoke-NoteAgent "what did I forget this week?"
```

**bash/zsh:**

```bash
alias note-agent='npx tsx ~/app/cli/agent.ts'
```

Keep `cli/config.json` out of git — it holds a live token.
