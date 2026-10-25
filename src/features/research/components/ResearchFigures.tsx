import { FigureCard } from './FigureCard';

const G_PATH = 'M55 24 A22 22 0 1 0 55 66 L55 48 L36 48';
const T_PATH = 'M144 20 L190 20 M167 20 L167 70';

/** Alternating inline-striped and solid chiselled letters. */
function PinstripeFigure() {
  return (
    <FigureCard
      caption="Fig. I · Deco Pinstripe System"
      note="Like Minded Studio paired 4-stripe concentric inline glyphs with solid chiseled platinum glyphs on alternating letters."
    >
      <g fill="none" stroke="#f8e29b" strokeLinecap="butt">
        <path d={G_PATH} strokeWidth="13" opacity="0.18" />
        <path d={G_PATH} strokeWidth="11" />
        <path d={G_PATH} stroke="#0d0a12" strokeWidth="7.8" />
        <path d={G_PATH} stroke="#f8e29b" strokeWidth="4.6" />
        <path d={G_PATH} stroke="#0d0a12" strokeWidth="1.6" />
      </g>
      <g fill="none" stroke="#e9eef7" strokeWidth="11" strokeLinejoin="miter">
        <path d="M84 70 L104 18 L124 70" />
        <path d="M90 54 L118 54" strokeWidth="8" />
      </g>
      <g fill="none" strokeLinecap="butt">
        <path d={T_PATH} stroke="#f8e29b" strokeWidth="11" />
        <path d={T_PATH} stroke="#0d0a12" strokeWidth="7.8" />
        <path d={T_PATH} stroke="#f8e29b" strokeWidth="4.6" />
        <path d={T_PATH} stroke="#0d0a12" strokeWidth="1.6" />
      </g>
    </FigureCard>
  );
}

function ChamferFigure() {
  return (
    <FigureCard
      caption="Fig. II · 3D Bevelled Gold Rail"
      note="Deva & Method Studios modeled every golden frame line as a 3D chamfered rail so raking spotlights glint off angled facets."
    >
      <polygon points="36,68 58,34 162,34 184,68" fill="rgba(212,175,55,0.18)" stroke="#f8e29b" strokeWidth="1.8" />
      <line x1="78" y1="34" x2="78" y2="68" stroke="#d4af37" strokeDasharray="3 3" />
      <line x1="142" y1="34" x2="142" y2="68" stroke="#d4af37" strokeDasharray="3 3" />
      <line x1="46" y1="48" x2="26" y2="22" stroke="#fff6dc" strokeWidth="1.4" />
      <line x1="110" y1="34" x2="110" y2="12" stroke="#fff6dc" strokeWidth="1.4" />
      <line x1="174" y1="48" x2="194" y2="22" stroke="#fff6dc" strokeWidth="1.4" />
      <text x="110" y="83" textAnchor="middle" fill="#d4af37" fontSize="9" letterSpacing="2">
        45° CHAMFERED PRISM
      </text>
    </FigureCard>
  );
}

function CorridorFigure() {
  return (
    <FigureCard
      caption="Fig. III · Z-Axis Portal Sweep"
      note="Built natively for 3D cinema: multi-plane golden frames draw outward, hold during push-in, then part open as the lens flies through."
    >
      <rect x="28" y="14" width="164" height="62" fill="none" stroke="#f8e29b" strokeWidth="1.6" />
      <rect x="54" y="24" width="112" height="42" fill="none" stroke="#d4af37" strokeWidth="1.2" opacity="0.75" />
      <rect x="78" y="33" width="64" height="24" fill="none" stroke="#d4af37" strokeWidth="1" opacity="0.5" />
      <circle cx="110" cy="45" r="3.5" fill="#14f582" />
      <path d="M16 45 L42 45 M204 45 L178 45" stroke="#fff4d4" strokeWidth="1.4" />
    </FigureCard>
  );
}

export function ResearchFigures() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <PinstripeFigure />
      <ChamferFigure />
      <CorridorFigure />
    </div>
  );
}
