import * as z from 'zod/v4';
import { formatNodePath } from './propertyReports.js';

export const changedCellsSchema = z.object({ scene: z.string(), path: z.string(), set: z.number(), erased: z.number(), unchanged: z.number(), count: z.number() });

export type ChangedCells = z.infer<typeof changedCellsSchema>;

export interface CellBox {
  readonly from?: readonly number[] | undefined;
  readonly to?: readonly number[] | undefined;
}

export interface CellTotals extends CellBox {
  readonly count: number;
}

export function formatCell(cell: readonly number[]): string {
  return `[${cell.join(', ')}]`;
}

export function countCells(count: number): string {
  return `${String(count)} ${count === 1 ? 'cell' : 'cells'}`;
}

export function describeCellTotals(totals: CellTotals, box: CellBox, perKind: string): string {
  const inBox = box.from !== undefined && box.to !== undefined ? `Between ${formatCell(box.from)} and ${formatCell(box.to)} it` : 'It';
  if (totals.count === 0) {
    return `${inBox} has no cells.`;
  }
  const extent = inBox === 'It' && totals.from !== undefined && totals.to !== undefined ? `, from ${formatCell(totals.from)} to ${formatCell(totals.to)}` : '';
  return `${inBox} has ${countCells(totals.count)}${extent}: ${perKind}.`;
}

export function describeListedPart(listed: number, count: number): string {
  return `Only the first ${String(listed)} of ${countCells(count)} are listed; read more with a larger max_cells, or a part with from and to.`;
}

export function describeChangedCells(result: ChangedCells): string {
  const owner = `${formatNodePath(result.path)} in ${result.scene}`;
  const already = `already ${result.unchanged === 1 ? 'was' : 'were'} so`;
  if (result.set + result.erased === 0) {
    return `The ${countCells(result.unchanged)} given ${already} in ${owner}, so nothing changed. It has ${countCells(result.count)}.`;
  }
  const changes = [result.set > 0 ? `set ${countCells(result.set)}` : '', result.erased > 0 ? `erased ${countCells(result.erased)}` : ''].filter((change) => change !== '').join(' and ');
  const unchanged = result.unchanged > 0 ? `; ${countCells(result.unchanged)} ${already}` : '';
  return `${changes.charAt(0).toUpperCase()}${changes.slice(1)} of ${owner} as one Undo step${unchanged}. It now has ${countCells(result.count)}. The scene has unsaved changes.`;
}
