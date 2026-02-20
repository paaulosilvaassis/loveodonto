import {
  FDI_LOWER_DECIDUOUS,
  FDI_LOWER_PERMANENT,
  FDI_UPPER_DECIDUOUS,
  FDI_UPPER_PERMANENT,
} from './odontogramV2Constants.js';

const VIEWBOX = { width: 1200, height: 640 };
const TOOTH_SIZE = { width: 44, height: 64 };
const DECIDUOUS_SIZE = { width: 36, height: 52 };
const UPPER_Y = 190;
const LOWER_Y = 400;
const UPPER_DECIDUOUS_Y = 110;
const LOWER_DECIDUOUS_Y = 520;
const START_X = 80;
const END_X = 1120;

export const getViewBox = () => VIEWBOX;

export const getToothSize = (type = 'permanent') => (type === 'deciduous' ? DECIDUOUS_SIZE : TOOTH_SIZE);

export const buildRowPositions = (ids, y, size, totalSlots, labelOffset = -12) => {
  const total = totalSlots || ids.length;
  const gap = (END_X - START_X) / (total - 1);
  return ids.map((id, index) => ({
    id,
    x: START_X + gap * index,
    y,
    size,
    labelOffset,
  }));
};

export const buildRowConfig = (type = 'permanent') => {
  if (type === 'deciduous') {
    const upperOffset = -(DECIDUOUS_SIZE.height / 2 + 10);
    const lowerOffset = DECIDUOUS_SIZE.height / 2 + 18;
    return {
      upper: buildRowPositions(FDI_UPPER_DECIDUOUS, UPPER_DECIDUOUS_Y, DECIDUOUS_SIZE, 10, upperOffset),
      lower: buildRowPositions(FDI_LOWER_DECIDUOUS, LOWER_DECIDUOUS_Y, DECIDUOUS_SIZE, 10, lowerOffset),
    };
  }
  const upperOffset = -(TOOTH_SIZE.height / 2 + 12);
  const lowerOffset = TOOTH_SIZE.height / 2 + 18;
  return {
    upper: buildRowPositions(FDI_UPPER_PERMANENT, UPPER_Y, TOOTH_SIZE, 16, upperOffset),
    lower: buildRowPositions(FDI_LOWER_PERMANENT, LOWER_Y, TOOTH_SIZE, 16, lowerOffset),
  };
};

export const buildFacePolygons = (x, y, size = TOOTH_SIZE) => {
  const w = size.width;
  const h = size.height;
  const left = x - w / 2;
  const top = y - h / 2;
  const right = x + w / 2;
  const bottom = y + h / 2;
  const cx = x;
  const cy = y;
  const inset = Math.max(8, Math.round(Math.min(w, h) * 0.22));

  return {
    O: [
      [cx - inset, cy - inset],
      [cx + inset, cy - inset],
      [cx + inset, cy + inset],
      [cx - inset, cy + inset],
    ],
    M: [
      [left, cy - inset],
      [cx - inset, cy - inset],
      [cx - inset, cy + inset],
      [left, cy + inset],
    ],
    D: [
      [cx + inset, cy - inset],
      [right, cy - inset],
      [right, cy + inset],
      [cx + inset, cy + inset],
    ],
    V: [
      [cx - inset, top],
      [cx + inset, top],
      [cx + inset, cy - inset],
      [cx - inset, cy - inset],
    ],
    L: [
      [cx + inset, cy + inset],
      [right, cy + inset],
      [right, bottom],
      [cx + inset, bottom],
    ],
    P: [
      [left, cy + inset],
      [cx - inset, cy + inset],
      [cx - inset, bottom],
      [left, bottom],
    ],
  };
};

export const polygonToString = (points) => points.map((point) => point.join(',')).join(' ');
