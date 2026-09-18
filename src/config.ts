import type { Note } from './types';

export type BackgroundMode = 'solid' | 'silk' | 'moonlit' | 'rain';

export interface SiteConfig {
  title: string
  description: string
  language: string
}

export interface HeaderConfig {
  brandMark: string
  noteCountSuffix: string
  editorViewLabel: string
  graphViewLabel: string
  backgroundButtonTitle: string
  importButtonLabel: string
}

export interface BackgroundOption {
  id: BackgroundMode
  label: string
}

export interface SolidColorOption {
  color: string
  label: string
}

export interface BackgroundConfig {
  defaultMode: BackgroundMode
  defaultSolidColor: string
  options: BackgroundOption[]
  solidColors: SolidColorOption[]
}

export interface SidebarConfig {
  searchPlaceholder: string
  noResultsLabel: string
  emptyNotesLabel: string
  selectAllLabel: string
  clearSelectionLabel: string
  selectedCountSuffix: string
  deleteSelectedLabel: string
  cancelLabel: string
  newNoteLabel: string
  manageLabel: string
}

export interface EditorConfig {
  editLabel: string
  previewLabel: string
  sourceLabel: string
  deleteLabel: string
  cancelLabel: string
  titlePlaceholder: string
  contentPlaceholder: string
  outgoingLinksLabel: string
  incomingLinksLabel: string
}

export interface GraphConfig {
  notesLabel: string
  connectionsLabel: string
  emptyGraphLabel: string
}

export interface MoonConfig {
  phaseLabels: string[]
}

export interface AppConfig {
  emptyStateLabel: string
}

export interface StorageConfig {
  notesKey: string
}

export interface StarterNote extends Pick<Note, 'title' | 'content' | 'tags' | 'source'> {}

export const siteConfig: SiteConfig = {
  title: "Alliance Gagnante — Francis Végiard Dev",
  description: "Alliance Gagnante — Francis Végiard Dev. Punk-styled notes, keys vault, AI agent.",
  language: "",
}

export const headerConfig: HeaderConfig = {
  brandMark: "AG ⚡ FVD",
  noteCountSuffix: " notes",
  editorViewLabel: "Notes",
  graphViewLabel: "Graph",
  backgroundButtonTitle: "Change background",
  importButtonLabel: "",
}

export const backgroundConfig: BackgroundConfig = {
  defaultMode: 'moonlit',
  defaultSolidColor: '#000000',
  options: [
    { id: 'moonlit', label: "Moonlit" },
    { id: 'silk', label: "Silk" },
    { id: 'rain', label: "Rain" },
    { id: 'solid', label: "Solid" },
  ],
  solidColors: [
    { color: '#000000', label: "Ink" },
    { color: '#1a1a2e', label: "Night" },
    { color: '#1a1308', label: "Coffee" },
    { color: '#0d1f0d', label: "Forest" },
  ],
}

export const sidebarConfig: SidebarConfig = {
  searchPlaceholder: "Search notes...",
  noResultsLabel: "No matching notes",
  emptyNotesLabel: "No notes yet",
  selectAllLabel: "Select all",
  clearSelectionLabel: "Clear",
  selectedCountSuffix: " selected",
  deleteSelectedLabel: "Delete",
  cancelLabel: "Cancel",
  newNoteLabel: "New note",
  manageLabel: "Manage",
}

export const editorConfig: EditorConfig = {
  editLabel: "Edit",
  previewLabel: "Preview",
  sourceLabel: "Source",
  deleteLabel: "Delete",
  cancelLabel: "Cancel",
  titlePlaceholder: "Note title...",
  contentPlaceholder: "Write here... Use [[Title]] to create a wiki link. Markdown is supported.",
  outgoingLinksLabel: "Links to:",
  incomingLinksLabel: "Linked from:",
}

export const graphConfig: GraphConfig = {
  notesLabel: "notes",
  connectionsLabel: "connections",
  emptyGraphLabel: "No notes yet — create your first note to begin",
}

export const moonConfig: MoonConfig = {
  phaseLabels: ["New", "Wax Cres", "1st Qtr", "Wax Gib", "Full", "Wan Gib", "3rd Qtr", "Wan Cres"],
}

export const appConfig: AppConfig = {
  emptyStateLabel: "Select a note, or create a new one",
}

export const storageConfig: StorageConfig = {
  notesKey: "alliance-gagnante-v1",
}

export const starterNotes: StarterNote[] = [
  {
    title: "Welcome to My Notes",
    content: `# Welcome to My Notes

This is your new home for notes — a calm, searchable notepad that syncs across every device once you sign in.

## What's here

- **[[Getting Started]]** — a two-minute tour
- **[[Migrating Old Notes]]** — how to rescue the good stuff from your old notepad
- **[[Inbox]]** — your dump zone for anything messy

## The one habit that matters

Dump first, organize later. Everything lands in the [[Inbox]], then gets promoted to a real note — or deleted without mercy.

> Keep only what you'll actually use again. The rest is noise.
`,
    tags: ["guide", "start"],
    source: "",
  },
  {
    title: "Getting Started",
    content: `# Getting Started

Two minutes is all you need.

## Basics

1. **New note** — click *New note* in the sidebar
2. **Write** — Markdown is supported, see the [[Markdown Cheat Sheet]]
3. **Preview** — switch between the Edit and Preview tabs
4. **Find** — the search box filters by title and content

## Wiki links

Wrap a note's title in double square brackets — like [[Markdown Cheat Sheet]] — to link to it. If the target doesn't exist yet, following the link creates it on the spot. This is how your notes become a web of ideas instead of a pile of tabs.

## The Graph view

Switch to **Graph** in the header to see every note and its connections. Drag nodes around, zoom in, and spot islands of thought.

## Make it yours

The background button in the header cycles four moods: moonlit water, silk flow, rain on glass, or a plain solid color.

Next: [[Migrating Old Notes]] · [[Welcome to My Notes]]
`,
    tags: ["guide", "howto"],
    source: "",
  },
  {
    title: "Migrating Old Notes",
    content: `# Migrating Old Notes

Bringing over a giant, messy notepad? Don't copy everything — curate.

## The three-bucket rule

For every old tab or chunk of text, decide:

| Bucket | Action |
|--------|--------|
| **Keep** | Move it into its own clean note |
| **Maybe** | Dump it in the [[Inbox]], revisit in a week |
| **Noise** | Delete it. Be ruthless. |

## Suggested flow

1. Paste a batch of old content into the [[Inbox]]
2. Pull out anything worth keeping into real notes — a [[Code Snippets]] entry, an [[Ideas]] entry, a task in [[To-Do]]
3. Link related notes together — like this one links to [[Code Snippets]] — so nothing gets lost again
4. Empty the Inbox regularly — it's a hallway, not a storage room

## A good test

> If you haven't looked at a note in six months and can't imagine searching for it, it was never a note — it was clutter.

See also: [[Welcome to My Notes]]
`,
    tags: ["guide", "migrate", "cleanup"],
    source: "",
  },
  {
    title: "Inbox",
    content: `# Inbox

The dump zone. Paste anything here — half-thoughts, copied text, links, scraps of code.

## Rules of the Inbox

- No organizing allowed in here
- No guilt about mess
- Once a week: process it — promote keepers into real notes, delete the rest

## Unprocessed

_Paste your next batch below this line._

---

When something in here turns out to be useful, move it to [[Ideas]], [[To-Do]], or its own note. More in [[Migrating Old Notes]].
`,
    tags: ["inbox", "daily"],
    source: "",
  },
  {
    title: "To-Do",
    content: `# To-Do

Markdown task lists work out of the box — switch to Preview to check things off.

## This week

- [ ] Migrate the first batch of old notes (see [[Migrating Old Notes]])
- [ ] Process the [[Inbox]]
- [ ] Add three snippets to [[Code Snippets]]

## Later

- [ ] Try the Graph view once you have 10+ notes
- [ ] Pick a background that fits your mood

Keep tasks small, and link to related notes like [[Ideas]] when a task grows into a project.
`,
    tags: ["tasks", "daily"],
    source: "",
  },
  {
    title: "Ideas",
    content: `# Ideas

A parking lot for things that aren't tasks yet.

## How to use this note

- One line per idea — no polishing
- When an idea keeps coming back, promote it to its own note
- Link it — a wiki link like [[Code Snippets]] connects it to the rest of your notes

## Parked ideas

- _Your first idea goes here..._

Ideas often become tasks in [[To-Do]] or references in [[Code Snippets]]. New here? Read [[Getting Started]].
`,
    tags: ["ideas", "capture"],
    source: "",
  },
  {
    title: "Code Snippets",
    content: `# Code Snippets

Keep the good code. Delete the bad code. That's the whole system.

## Fenced code blocks

Wrap code in triple backticks with a language name, and it renders with monospace formatting:

    \`\`\`python
    def hello(name: str) -> str:
        return f"Hello, {name}!"
    \`\`\`

## My snippets

### Quick timer (Python)

    import time

    start = time.perf_counter()
    # ... code to measure ...
    print(f"{time.perf_counter() - start:.3f}s")

## Rules

1. Only save code you've actually run or tested
2. One snippet per section, with a one-line *why*
3. If you can't remember why you saved it, delete it

Related: [[Markdown Cheat Sheet]] for syntax, [[Migrating Old Notes]] for the cleanup mindset, [[Ideas]] for things to build.
`,
    tags: ["code", "reference"],
    source: "",
  },
  {
    title: "Markdown Cheat Sheet",
    content: `# Markdown Cheat Sheet

Everything you can use in a note.

## Text

    **bold**   *italic*   ~~strikethrough~~   \`inline code\`

## Headings

    # Big   ## Medium   ### Small

## Lists

    - bullet
    1. numbered
    - [ ] task (see [[To-Do]])

## Tables

    | Column | Column |
    |--------|--------|
    | cell   | cell   |

## Quotes & code

    > a blockquote

    \`\`\`js
    console.log("fenced code block");
    \`\`\`

## Wiki links

The special one: double square brackets around a title — like [[Getting Started]] — links notes together and feeds the Graph view. Learn more in [[Getting Started]].

Practice in the [[Inbox]], then build something real. Back to [[Welcome to My Notes]].
`,
    tags: ["reference", "markdown"],
    source: "",
  },
  {
    title: "🔐 Credentials Vault",
    content: `# 🔐 Credentials Vault

_Template — your real keys live only in your private database. This public-safe version ships with the repo._

## How to use this vault

| Section | What goes here |
|---------|----------------|
| **Working keys** | Service + key + notes |
| **Problem keys** | Keys that failed validation, with the error |
| **Untested** | Keys to verify later |
| **Reminders** | Expiry dates and rotation tasks |

## Reminders

- [ ] Add your keys here (or let the ✦ Note Agent scan for them)
- [ ] Set rotation reminders for expiring tokens

See [[Welcome to My Notes]] · scan anytime via the ✦ Note Agent.
`,
    tags: ["vault", "keys", "credentials"],
    source: "",
  },
]
