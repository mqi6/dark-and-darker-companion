import { createStashPreview } from "../domain/stashPreview";
import type { SpatialContainer } from "../domain/inventoryGeometry";
import { validateReservedRegions, type GridRectangle } from "../domain/stash";

export interface StashPreviewGridProps {
  container: SpatialContainer;
  label: string;
  reservedRegions?: readonly GridRectangle[];
}

export function StashPreviewGrid({ container, label, reservedRegions = [] }: StashPreviewGridProps) {
  if (container.status !== "ready" || container.geometry.kind !== "rectangular") {
    return (
      <div className="stash-preview-blocked" role="alert">
        {container.diagnostics.map((diagnostic) => (
          <p key={`${diagnostic.code}:${diagnostic.alias ?? "container"}`}>
            {diagnostic.message}
          </p>
        ))}
      </div>
    );
  }

  const preview = createStashPreview(container);
  const reservedValidation = validateReservedRegions(
    { columns: preview.columns, rows: preview.rows },
    reservedRegions
  );
  if (!reservedValidation.valid) {
    return (
      <div className="stash-preview-blocked" role="alert">
        {reservedValidation.errors.map((error) => <p key={error}>{error}</p>)}
      </div>
    );
  }
  return (
    <div
      className="stash-preview"
      role="grid"
      aria-label={label}
      aria-rowcount={preview.rows}
      aria-colcount={preview.columns}
      style={{
        gridTemplateColumns: `repeat(${preview.columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${preview.rows}, minmax(0, 1fr))`
      }}
    >
      {preview.cells.map((cell) => (
        <span
          className="stash-preview-cell"
          role="gridcell"
          aria-label={cell.alias ? `${cell.x},${cell.y}: ${cell.alias}` : `${cell.x},${cell.y}`}
          key={`${cell.x},${cell.y}`}
          style={{ gridColumn: cell.x + 1, gridRow: cell.y + 1 }}
        />
      ))}
      {preview.placements.map((placement, index) => (
        <div
          className={`stash-preview-item rarity-${placement.metadata.rarity.toLowerCase()}`}
          key={placement.alias}
          aria-label={`${placement.alias}, ${placement.width} by ${placement.height}`}
          style={{
            gridColumn: `${placement.x + 1} / span ${placement.width}`,
            gridRow: `${placement.y + 1} / span ${placement.height}`,
            animationDelay: `${Math.min(index * 24, 168)}ms`
          }}
        >
          <span>{placement.width}×{placement.height}</span>
          {placement.stackQuantity > 1 && <strong>{placement.stackQuantity}</strong>}
        </div>
      ))}
      {reservedRegions.map((region, index) => (
        <div
          className="stash-preview-reserved"
          aria-label={`reserved region ${index + 1}`}
          key={`${region.x},${region.y},${region.width},${region.height}`}
          style={{
            gridColumn: `${region.x + 1} / span ${region.width}`,
            gridRow: `${region.y + 1} / span ${region.height}`
          }}
        >
          <span>LOCKED</span>
        </div>
      ))}
    </div>
  );
}
