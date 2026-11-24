import type { Geometry } from './layout.ts';

/** Seat angles around the table in degrees, measured anticlockwise from the right. */
const SEAT_ANGLES = [270, 39 + 360, 141 + 360, 270 + 360];
const GAP = 15;

function DirectionArcs({ g, moving, lively }: { g: Geometry; moving: boolean; lively: boolean }) {
  const rx = g.table.rx + g.table.rail + 15;
  const ry = g.table.ry + g.table.rail + 15;
  const point = (degrees: number) => {
    const radians = (degrees * Math.PI) / 180;
    return { x: g.table.cx + rx * Math.cos(radians), y: g.table.cy - ry * Math.sin(radians) };
  };

  const arcs = [0, 1, 2].map((i) => {
    const from = SEAT_ANGLES[i] + GAP;
    const to = SEAT_ANGLES[i + 1] - GAP;
    const start = point(from);
    const end = point(to);
    const radians = (to * Math.PI) / 180;
    const heading = (Math.atan2(-ry * Math.cos(radians), -rx * Math.sin(radians)) * 180) / Math.PI;
    return { d: `M${start.x} ${start.y}A${rx} ${ry} 0 0 0 ${end.x} ${end.y}`, end, heading };
  });

  return (
    <svg className="pointer-events-none absolute inset-0" width={g.width} height={g.height} aria-hidden="true">
      {arcs.map((arc, i) => (
        <g key={i}>
          <path d={arc.d} fill="none" stroke="#C8A45D" strokeOpacity={0.2} strokeWidth={1} />
          {moving && (
            <path
              d={arc.d}
              fill="none"
              stroke="#E2C98F"
              strokeOpacity={lively ? 0.85 : 0.5}
              strokeWidth={1.4}
              strokeLinecap="round"
              pathLength={1000}
              strokeDasharray="70 930"
              style={{ animation: `arc-travel ${lively ? 3.2 : 6}s linear ${-i * 0.4}s infinite` }}
            />
          )}
          <path
            d="M-7 -4.500 0 0 -7 4.500"
            fill="none"
            stroke="#C8A45D"
            strokeOpacity={0.75}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            transform={`translate(${arc.end.x} ${arc.end.y}) rotate(${arc.heading})`}
          />
        </g>
      ))}
    </svg>
  );
}

/** The oval table: a bronze rail with a gold edge around emerald felt. */
/** `moving` runs the travelling highlight that shows the anticlockwise direction of play. */
export function Table({ g, moving, lively }: { g: Geometry; moving: boolean; lively: boolean }) {
  const { cx, cy, rx, ry, rail } = g.table;
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className="table-shadow absolute"
        style={{ left: cx - rx * 1.06, top: cy - ry * 0.8 + rail + 26, width: rx * 2.12, height: ry * 2.05 }}
      />
      <DirectionArcs g={g} moving={moving} lively={lively} />
      <div
        className="table-rail absolute"
        style={{ left: cx - rx - rail, top: cy - ry - rail, width: (rx + rail) * 2, height: (ry + rail) * 2 + rail * 0.35 }}
      />
      <div className="table-felt absolute" style={{ left: cx - rx, top: cy - ry, width: rx * 2, height: ry * 2 }}>
        <div className="felt-grain" />
        <div className="felt-line" style={{ inset: '5.5% 4%' }} />
        <div
          className="absolute left-1/2 -translate-x-1/2 font-serif font-semibold text-gold/[0.07]"
          style={{ bottom: '8%', fontSize: ry * 0.2, letterSpacing: '0.42em', paddingLeft: '0.42em' }}
        >
          CHAPKA
        </div>
      </div>
    </div>
  );
}
