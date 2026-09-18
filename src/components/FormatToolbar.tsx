import type { RefObject } from 'react';

interface ToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  content: string;
  onChange: (next: string) => void;
  onToggleCalque: () => void;
  calqueOn: boolean;
}

const COLORS = [
  { cls: 'txt-pink', hex: '#ff2d78', label: 'Pink' },
  { cls: 'txt-yellow', hex: '#ffe600', label: 'Yellow' },
  { cls: 'txt-green', hex: '#a3ff12', label: 'Green' },
  { cls: 'txt-cyan', hex: '#00e5ff', label: 'Cyan' },
];

const MARKS = [
  { cls: '', hex: '#ff2d78', label: 'Pink hl' },
  { cls: 'yellow', hex: '#ffe600', label: 'Yellow hl' },
  { cls: 'green', hex: '#a3ff12', label: 'Green hl' },
];

const SIZES = [
  { em: '0.85em', label: 'S' },
  { em: '1em', label: 'M' },
  { em: '1.3em', label: 'L' },
  { em: '1.7em', label: 'XL' },
];

export default function FormatToolbar({ textareaRef, content, onChange, onToggleCalque, calqueOn }: ToolbarProps) {
  /** Wrap the current selection (or insert at cursor) with before/after text. */
  const wrap = (before: string, after: string, placeholder = 'text') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const selected = content.slice(s, e) || placeholder;
    const next = content.slice(0, s) + before + selected + after + content.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  };

  const btn =
    'px-2 py-1 text-xs rounded transition-colors text-[#888] hover:text-[#ff2d78] hover:bg-white/[0.06]';

  return (
    <div className="flex items-center gap-0.5 flex-wrap px-6 py-1.5 border-b border-white/[0.04] bg-white/[0.02]">
      <button className={`${btn} font-bold`} title="Bold" onClick={() => wrap('**', '**')}>B</button>
      <button className={`${btn} italic`} title="Italic" onClick={() => wrap('*', '*')}>I</button>
      <button className={`${btn} underline`} title="Underline" onClick={() => wrap('<u>', '</u>')}>U</button>

      <span className="w-px h-4 bg-white/[0.08] mx-1" />

      {/* Highlights */}
      {MARKS.map((m) => (
        <button
          key={m.label}
          className={btn}
          title={m.label}
          onClick={() => wrap(m.cls ? `<mark class="${m.cls}">` : '<mark>', '</mark>')}
        >
          <span style={{ background: m.hex, color: '#111', padding: '0 5px', borderRadius: 2, fontSize: 10 }}>A</span>
        </button>
      ))}

      <span className="w-px h-4 bg-white/[0.08] mx-1" />

      {/* Text colors */}
      {COLORS.map((c) => (
        <button
          key={c.cls}
          className={btn}
          title={c.label}
          onClick={() => wrap(`<span class="${c.cls}">`, '</span>')}
        >
          <span style={{ color: c.hex, fontWeight: 700, fontSize: 11 }}>A</span>
        </button>
      ))}

      <span className="w-px h-4 bg-white/[0.08] mx-1" />

      {/* Sizes */}
      {SIZES.map((s) => (
        <button
          key={s.label}
          className={btn}
          title={`Size ${s.label}`}
          onClick={() => wrap(`<span style="font-size:${s.em}">`, '</span>')}
        >
          <span style={{ fontSize: s.label === 'S' ? 9 : s.label === 'M' ? 11 : s.label === 'L' ? 13 : 15 }}>A</span>
        </button>
      ))}

      <span className="w-px h-4 bg-white/[0.08] mx-1" />

      {/* Calque — draggable overlay layer */}
      <button
        className={`${btn} ${calqueOn ? 'text-[#ff2d78] bg-white/[0.08]' : ''}`}
        title="Calque — draggable overlay rectangle"
        onClick={onToggleCalque}
      >
        ▱ Calque
      </button>
    </div>
  );
}
