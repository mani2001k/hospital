import { useMemo } from 'react';

export interface SeriesPoint {
  time: string;
  value: number;
  actual?: number | null;
}

export function LineChart({
  data,
  height = 160,
  color = '#38bdf8',
  showActual = false,
  unit = '',
}: {
  data: SeriesPoint[];
  height?: number;
  color?: string;
  showActual?: boolean;
  unit?: string;
}) {
  const { path, areaPath, actualPath, min, max, points, actualPoints, ticks } = useMemo(() => {
    if (data.length === 0) {
      return { path: '', areaPath: '', actualPath: '', min: 0, max: 1, points: [] as { x: number; y: number; d: SeriesPoint }[], actualPoints: [] as { x: number; y: number }[], ticks: [] as number[] };
    }
    const w = 600;
    const h = height;
    const padL = 36;
    const padR = 12;
    const padT = 12;
    const padB = 24;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const values = data.map((d) => d.value);
    const actuals = data.map((d) => d.actual).filter((v): v is number => v != null);
    const all = [...values, ...actuals];
    const rawMin = Math.min(...all);
    const rawMax = Math.max(...all);
    const range = rawMax - rawMin || 1;
    const min = rawMin - range * 0.1;
    const max = rawMax + range * 0.1;

    const xScale = (i: number) => padL + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2);
    const yScale = (v: number) => padT + plotH - ((v - min) / (max - min)) * plotH;

    const pts = data.map((d, i) => ({ x: xScale(i), y: yScale(d.value), d }));
    const aPts = data
      .map((d, i) => ({ x: xScale(i), y: yScale(d.actual ?? 0), has: d.actual != null }))
      .filter((p) => p.has) as { x: number; y: number }[];

    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const areaP = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${padT + plotH} L ${pts[0].x.toFixed(1)} ${padT + plotH} Z`;
    const actPath = aPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

    const tickCount = 4;
    const tickArr = Array.from({ length: tickCount }, (_, i) => min + ((max - min) * i) / (tickCount - 1));

    return { path: linePath, areaPath: areaP, actualPath: actPath, min, max, points: pts, actualPoints: aPts, ticks: tickArr };
  }, [data, height]);

  if (data.length === 0) {
    return <div style={{ height }} className="flex items-center justify-center text-xs text-slate-500">No data</div>;
  }

  const w = 600;
  const h = height;
  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 24;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => {
        const y = padT + (h - padT - padB) - ((t - min) / (max - min || 1)) * (h - padT - padB);
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="rgb(51 65 85)" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.4" />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="rgb(100 116 139)">
              {t.toFixed(0)}{unit}
            </text>
          </g>
        );
      })}
      <path d={areaPath} fill={`url(#grad-${color.replace('#', '')})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {showActual && actualPath && (
        <path d={actualPath} fill="none" stroke="rgb(148 163 184)" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" opacity="0.7" />
      )}
      {points.length <= 20 && points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} />
      ))}
    </svg>
  );
}

export function BarChart({
  data,
  height = 200,
  color = '#38bdf8',
}: {
  data: { label: string; value: number; sublabel?: string }[];
  height?: number;
  color?: string;
}) {
  if (data.length === 0) {
    return <div style={{ height }} className="flex items-center justify-center text-xs text-slate-500">No data</div>;
  }
  const max = Math.max(...data.map((d) => d.value)) || 1;
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="text-[10px] font-medium text-slate-400">{d.value.toFixed(0)}</div>
            <div
              className="w-full rounded-t transition-all hover:opacity-80"
              style={{ height: `${pct}%`, minHeight: '2px', backgroundColor: color, opacity: 0.85 }}
            />
            <div className="text-[10px] text-slate-500">{d.label}</div>
            {d.sublabel && <div className="text-[9px] text-slate-600">{d.sublabel}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function HeatMapGrid({
  rows,
  cols,
  values,
  rowLabels,
  colLabels,
}: {
  rows: number;
  cols: number;
  values: number[][];
  rowLabels: string[];
  colLabels: string[];
}) {
  const max = Math.max(...values.flat()) || 1;
  const min = Math.min(...values.flat());
  const range = max - min || 1;
  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="flex">
          <div className="w-20 shrink-0" />
          {colLabels.map((c, i) => (
            <div key={i} className="flex-1 text-center text-[9px] text-slate-500 min-w-[24px]">{c}</div>
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center">
            <div className="w-20 shrink-0 truncate pr-2 text-right text-[10px] text-slate-400">{rowLabels[r]}</div>
            {Array.from({ length: cols }).map((_, c) => {
              const v = values[r]?.[c] ?? 0;
              const intensity = (v - min) / range;
              const hue = intensity > 0.75 ? 0 : intensity > 0.5 ? 30 : intensity > 0.25 ? 60 : 200;
              const lightness = 40 + intensity * 15;
              return (
                <div
                  key={c}
                  className="m-0.5 flex h-7 flex-1 items-center justify-center rounded text-[9px] font-medium min-w-[24px]"
                  style={{
                    backgroundColor: `hsl(${hue} 60% ${lightness}%)`,
                    color: intensity > 0.5 ? 'white' : 'rgb(203 213 225)',
                  }}
                  title={`${rowLabels[r]} ${colLabels[c]}: ${v.toFixed(1)}`}
                >
                  {v.toFixed(0)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
