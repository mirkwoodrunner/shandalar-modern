import { useState, useRef, useEffect, useCallback } from 'react';
import type { TweakValues } from '../../hooks/useTweaks';
import styles from './TweaksPanel.module.css';

interface SliderProps {
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (v: number) => void;
}
export function TweakSlider({ label, value, min, max, step = 1, unit = '', onChange }: SliderProps) {
  return (
    <div className={styles.row}>
      <div className={styles.lbl}>
        <span>{label}</span>
        <span className={styles.val}>{value}{unit}</span>
      </div>
      <input type="range" className={styles.slider} min={min} max={max} step={step}
        value={value} onChange={e => onChange(Number(e.target.value))} />
    </div>
  );
}

interface ToggleProps { label: string; value: boolean; onChange: (v: boolean) => void; }
export function TweakToggle({ label, value, onChange }: ToggleProps) {
  return (
    <div className={`${styles.row} ${styles.rowH}`}>
      <span className={styles.lbl}>{label}</span>
      <button type="button" className={styles.toggle} data-on={value ? '1' : '0'}
        role="switch" aria-checked={value} onClick={() => onChange(!value)}>
        <i />
      </button>
    </div>
  );
}

interface RadioOpt { value: string; label: string; }
interface RadioProps { label: string; value: string; options: (string | RadioOpt)[]; onChange: (v: string) => void; }
export function TweakRadio({ label, value, options, onChange }: RadioProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const opts = options.map(o => typeof o === 'string' ? { value: o, label: o } : o);
  const idx = Math.max(0, opts.findIndex(o => o.value === value));
  const n = opts.length;
  const valueRef = useRef(value);
  valueRef.current = value;

  const segAt = useCallback((clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor(((clientX - r.left - 2) / inner) * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  }, [n, opts]);

  const onPointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = (ev: PointerEvent) => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className={styles.row}>
      <span className={styles.lbl}>{label}</span>
      <div ref={trackRef} role="radiogroup" onPointerDown={onPointerDown}
        className={`${styles.seg}${dragging ? ' ' + styles.dragging : ''}`}>
        <div className={styles.segThumb} style={{
          left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
          width: `calc((100% - 4px) / ${n})`,
        }} />
        {opts.map(o => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface SelectOpt { value: string; label: string; }
interface SelectProps { label: string; value: string; options: (string | SelectOpt)[]; onChange: (v: string) => void; }
export function TweakSelect({ label, value, options, onChange }: SelectProps) {
  const opts = options.map(o => typeof o === 'string' ? { value: o, label: o } : o);
  return (
    <div className={styles.row}>
      <span className={styles.lbl}>{label}</span>
      <select className={styles.field} value={value} onChange={e => onChange(e.target.value)}>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

interface ColorProps { label: string; value: string; onChange: (v: string) => void; }
export function TweakColor({ label, value, onChange }: ColorProps) {
  return (
    <div className={`${styles.row} ${styles.rowH}`}>
      <span className={styles.lbl}>{label}</span>
      <input type="color" className={styles.swatch} value={value}
        onChange={e => onChange(e.target.value)} />
    </div>
  );
}

interface NumberProps {
  label: string; value: number; min?: number; max?: number; step?: number; unit?: string;
  onChange: (v: number) => void;
}
export function TweakNumber({ label, value, min, max, step = 1, unit = '', onChange }: NumberProps) {
  const clamp = (n: number) => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = useRef({ x: 0, val: 0 });
  const onScrubStart = (e: React.PointerEvent) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, val: value };
    const decimals = (String(step).split('.')[1] ?? '').length;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className={styles.numBox}>
      <span className={styles.numLbl} onPointerDown={onScrubStart}>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={e => onChange(clamp(Number(e.target.value)))} />
      {unit && <span className={styles.numUnit}>{unit}</span>}
    </div>
  );
}

interface BtnProps { label: string; onClick: () => void; secondary?: boolean; }
export function TweakButton({ label, onClick, secondary = false }: BtnProps) {
  return (
    <button type="button" className={secondary ? `${styles.btn} ${styles.secondary}` : styles.btn}
      onClick={onClick}>{label}</button>
  );
}

export function TweakSection({ label }: { label: string }) {
  return <div className={styles.sect}>{label}</div>;
}

interface TweaksPanelProps {
  values: TweakValues;
  setTweak: <K extends keyof TweakValues>(key: K, val: TweakValues[K]) => void;
}

export function TweaksPanel({ values, setTweak }: TweaksPanelProps) {
  const [open, setOpen] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef({ x: 16, y: 16 });
  const PAD = 16;

  const clampToViewport = useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);

  useEffect(() => {
    if (!open) return;
    clampToViewport();
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const t = (e?.data as { type?: string })?.type;
      if (t === '__activate_edit_mode') setOpen(true);
      else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
  };

  const onDragStart = (e: React.MouseEvent) => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = (ev: MouseEvent) => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`' && !e.ctrlKey && !e.metaKey) setOpen(o => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  return (
    <div ref={dragRef} className={styles.panel}
      style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}>
      <div className={styles.header} onMouseDown={onDragStart}>
        <b>Tweaks</b>
        <button className={styles.closeBtn} aria-label="Close tweaks"
          onMouseDown={e => e.stopPropagation()} onClick={dismiss}>?</button>
      </div>
      <div className={styles.body}>
        <TweakSection label="Arrow" />
        <TweakColor label="Color" value={values.arrowColor}
          onChange={v => setTweak('arrowColor', v)} />
        <TweakSlider label="Thickness" value={values.arrowThickness} min={1} max={8} step={0.5} unit="px"
          onChange={v => setTweak('arrowThickness', v)} />
        <TweakRadio label="Style" value={values.arrowStyle}
          options={['solid', 'dashed', 'dotted']}
          onChange={v => setTweak('arrowStyle', v as TweakValues['arrowStyle'])} />
        <TweakToggle label="Glow" value={values.arrowGlow}
          onChange={v => setTweak('arrowGlow', v)} />
        <TweakToggle label="Animate" value={values.arrowAnimate}
          onChange={v => setTweak('arrowAnimate', v)} />

        <TweakSection label="AI Speed" />
        <TweakSlider label="AI Speed" value={values.aiSpeed} min={100} max={1000} step={50} unit="ms"
          onChange={v => setTweak('aiSpeed', v)} />
      </div>
    </div>
  );
}
