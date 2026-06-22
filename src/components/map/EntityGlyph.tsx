import { CircleHelp, MapPin, Package, UserRound, Waypoints } from "lucide-react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { isSupportedType } from "../../domain/contentTypes";
import type { EntityDocument, Position } from "../../domain/model";

export function EntityGlyph({
  entity,
  position,
  selected,
  warning,
  onPointerDown,
  onClick,
  onKeyDown,
}: {
  entity: EntityDocument;
  position: Position;
  selected: boolean;
  warning: boolean;
  onPointerDown: (event: PointerEvent<SVGGElement>) => void;
  onClick: (event: MouseEvent<SVGGElement>) => void;
  onKeyDown: (event: KeyboardEvent<SVGGElement>) => void;
}) {
  const className = `entity-glyph entity-${isSupportedType(entity.type) ? entity.type : "unsupported"}${
    selected ? " entity-selected" : ""
  }${warning ? " entity-warning" : ""}`;
  const icon = iconForType(entity.type);

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${entity.name}, ${entity.type}`}
      aria-pressed={selected}
      className={className}
      transform={`translate(${position.x} ${position.y})`}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <GlyphShape type={entity.type} />
      <foreignObject x={-8} y={-8} width={16} height={16} className="glyph-icon-fo">
        <span className="glyph-icon">{icon}</span>
      </foreignObject>
      <text className="entity-label" x={0} y={30} textAnchor="middle">
        {entity.name}
      </text>
    </g>
  );
}

function GlyphShape({ type }: { type: string }) {
  if (type === "location") return <rect className="glyph-shape" x={-11} y={-11} width={22} height={22} transform="rotate(45)" rx={3} />;
  if (type === "character") return <circle className="glyph-shape" r={15} />;
  if (type === "item") return <rect className="glyph-shape" x={-14} y={-14} width={28} height={28} rx={5} />;
  if (type === "portal") return <circle className="glyph-shape glyph-ring" r={17} />;
  return <circle className="glyph-shape glyph-unknown" r={16} />;
}

function iconForType(type: string) {
  const commonProps = { size: 14, "aria-hidden": true } as const;
  if (type === "location") return <MapPin {...commonProps} />;
  if (type === "character") return <UserRound {...commonProps} />;
  if (type === "item") return <Package {...commonProps} />;
  if (type === "portal") return <Waypoints {...commonProps} />;
  return <CircleHelp {...commonProps} />;
}
