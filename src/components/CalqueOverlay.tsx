import { useEffect, useRef, useState } from 'react';

type CalqueColor = 'pink' | 'yellow' | 'green' | 'cyan';

interface Props {
  onClose: () => void;
}

/** A draggable, resizable overlay rectangle ("calque") that floats above the
 *  note so you can position it over anything you want to frame/highlight. */
export default function CalqueOverlay({ onClose }: Props) {
  const [pos, setPos] = useState({ x: window.innerWidth / 2 - 130, y: 160, w: 260, h: 120 });
  const [color, setColor] = useState<CalqueColor>('pink');
  const drag = useRef<{ mode: 'move' | 'resize'; sx: number; sy: number; orig: typeof pos } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      const { mode, sx, sy, orig } = drag.current;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (mode === 'move') {
        setPos({ ...orig, x: orig.x + dx, y: orig.y + dy });
      } else {
        setPos({ ...orig, w: Math.max(60, orig.w + dx), h: Math.max(40, orig.h + dy) });
      }
    };
    const onUp = () => { drag.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const start = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = { mode, sx: e.clientX, sy: e.clientY, orig: pos };
  };

  const colorCls = color === 'pink' ? '' : color;

  return (
    <div
      className={`calque-overlay ${colorCls}`}
      style={{ left: pos.x, top: pos.y, width: pos.w, height: pos.h }}
      onPointerDown={start('move')}
    >
      <div className="calque-handle" title="Drag to move" />
      <div className="calque-resize" title="Drag to resize" onPointerDown={start('resize')} />

      {/* Mini toolbar */}
      <div
        className="absolute -top-8 left-0 flex items-center gap-1 bg-[#111] border border-white/[0.08] rounded-md px-1 py-0.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {(['pink', 'yellow', 'green', 'cyan'] as const).map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className="w-4 h-4 rounded-sm transition-transform hover:scale-110"
            style={{
              background: { pink: '#ff2d78', yellow: '#ffe600', green: '#a3ff12', cyan: '#00e5ff' }[c],
              boxShadow: color === c ? '0 0 0 1.5px #fff' : 'none',
            }}
          />
        ))}
        <button onClick={onClose} className="text-[#666] hover:text-white text-[10px] px-1" title="Close calque">✕</button>
      </div>
    </div>
  );
}
