import { describe, expect, it } from 'vitest';
import { lowestCornersOfCube, type Placement, placedPoint, placementIn } from './placement.js';

const turnedText = 'transform = Transform3D(0.8660254, -0.5, 0, 0.5, 0.8660254, 0, 0, 0, 1, 1, 2, 3)';

function turnedPlacement(): Placement {
  const placement = placementIn(turnedText, 'transform');
  if (placement === undefined) {
    throw new Error('The transform was not read');
  }
  return placement;
}

describe('placement', () => {
  it('reads a Transform3D property as Godot writes it, the basis by rows and then the origin', () => {
    const point = placedPoint(turnedPlacement(), { x: 1, y: 0, z: 0 });

    expect(point.x).toBeCloseTo(1.8660254);
    expect(point.y).toBeCloseTo(2.5);
    expect(point.z).toBeCloseTo(3);
  });

  it('finds no placement when the property is missing', () => {
    expect(placementIn(turnedText, 'global_transform')).toBeUndefined();
    expect(placementIn('transform = Vector3(1, 2, 3)', 'transform')).toBeUndefined();
  });

  it('returns the lowest corners of a turned cube, which are those of its bottom face', () => {
    const heights = lowestCornersOfCube(turnedPlacement(), 0.5, 4).map((corner) => corner.y);

    expect(heights).toEqual([expect.closeTo(1.3169873, 5), expect.closeTo(1.3169873, 5), expect.closeTo(1.8169873, 5), expect.closeTo(1.8169873, 5)]);
  });
});
