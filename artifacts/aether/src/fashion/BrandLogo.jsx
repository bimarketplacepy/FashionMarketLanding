// Logo oficial de Fashion Market: placa horizontal delineada con corchetes
// salientes en los extremos y el nombre en versalitas serif finas. Inline para
// que escale nítido y tome el color del contexto (currentColor); el tamaño se
// controla desde CSS (.brand-logo). textLength fija el ancho del texto para que
// el encaje no dependa de la fuente serif disponible.
export function BrandLogo({ subtitle }) {
  return (
    <svg
      className="brand-logo"
      viewBox="0 0 560 100"
      role="img"
      aria-label={subtitle ? `Fashion Market — ${subtitle}` : "Fashion Market"}
    >
      <g fill="none" stroke="currentColor" strokeWidth="6">
        {/* Mitades superior e inferior del marco, con hueco al medio de cada extremo */}
        <path d="M 18 38 L 18 30 Q 18 8 40 8 L 520 8 Q 542 8 542 30 L 542 38" />
        <path d="M 18 62 L 18 70 Q 18 92 40 92 L 520 92 Q 542 92 542 70 L 542 62" />
        {/* Corchetes de los extremos */}
        <path d="M 36 31 L 8 31 L 8 69 L 36 69" />
        <path d="M 524 31 L 552 31 L 552 69 L 524 69" />
      </g>
      <text
        x="280"
        y="64"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Italiana, Georgia, 'Times New Roman', serif"
        letterSpacing="4"
        textLength="400"
        lengthAdjust="spacingAndGlyphs"
      >
        <tspan fontSize="46">F</tspan>
        <tspan fontSize="34">ASHION</tspan>
        <tspan fontSize="46" dx="14">M</tspan>
        <tspan fontSize="34">ARKET</tspan>
      </text>
    </svg>
  );
}
