export interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Placement {
  readonly rows: readonly [Point, Point, Point];
  readonly origin: Point;
}

const transformNumberCount = 12;

export function placementIn(text: string, property: string): Placement | undefined {
  const marker = `${property} = Transform3D(`;
  const start = text.indexOf(marker);
  if (start < 0) {
    return undefined;
  }
  const body = text.slice(start + marker.length);
  const numbers = body
    .slice(0, body.indexOf(')'))
    .split(',')
    .map((value) => Number(value.trim()));
  if (numbers.length !== transformNumberCount || !numbers.every(Number.isFinite)) {
    return undefined;
  }
  const pointAt = (offset: number): Point => ({ x: numbers[offset] ?? 0, y: numbers[offset + 1] ?? 0, z: numbers[offset + 2] ?? 0 });
  return { rows: [pointAt(0), pointAt(3), pointAt(6)], origin: pointAt(9) };
}

export function placedPoint(placement: Placement, local: Point): Point {
  const [first, second, third] = placement.rows;
  const along = (row: Point): number => row.x * local.x + row.y * local.y + row.z * local.z;
  return { x: along(first) + placement.origin.x, y: along(second) + placement.origin.y, z: along(third) + placement.origin.z };
}

export function lowestCornersOfCube(placement: Placement, halfSize: number, count: number): Point[] {
  const offsets = [-halfSize, halfSize];
  const corners = offsets.flatMap((x) => offsets.flatMap((y) => offsets.map((z) => placedPoint(placement, { x, y, z }))));
  return corners.sort((first, second) => first.y - second.y).slice(0, count);
}
