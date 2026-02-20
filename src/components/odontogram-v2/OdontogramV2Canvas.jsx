import { useMemo, useRef, useState } from 'react';
import { FACE_LABELS, FACES, STATUS_OPTIONS } from './odontogramV2Constants.js';
import { buildFacePolygons, buildRowConfig, getViewBox, polygonToString } from './odontogramV2Utils.js';
import { useOdontogramV2 } from './odontogramV2Store.jsx';

const STATUS_COLOR_MAP = STATUS_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.color;
  return acc;
}, {});

const getSurfaceColor = (status) => STATUS_COLOR_MAP[status] || '#94a3b8';

const isMissing = (status) => status === 'AUSENTE' || status === 'EXTRACAO';

export default function OdontogramV2Canvas({ stage = 'adulto' }) {
  const { state, dispatch } = useOdontogramV2();
  const svgRef = useRef(null);
  const pointerState = useRef({ active: false, start: null, startTranslate: null, pointers: new Map(), pinchStart: null });
  const dragState = useRef({ moved: false, start: null });
  const [zoom, setZoom] = useState({ scale: 1, tx: 0, ty: 0 });
  const viewBox = getViewBox();

  const rowConfig = useMemo(() => {
    const permanent = buildRowConfig('permanent');
    const deciduous = buildRowConfig('deciduous');
    if (stage === 'infantil') {
      return [deciduous.upper, deciduous.lower];
    }
    if (stage === 'mista') {
      return [deciduous.upper, permanent.upper, permanent.lower, deciduous.lower];
    }
    return [permanent.upper, permanent.lower];
  }, [stage]);

  const positions = useMemo(() => rowConfig.flat(), [rowConfig]);

  const applyZoom = (next) => {
    setZoom((prev) => ({
      scale: Math.max(0.5, Math.min(2.5, next.scale ?? prev.scale)),
      tx: next.tx ?? prev.tx,
      ty: next.ty ?? prev.ty,
    }));
  };

  const screenToSvg = (clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * viewBox.width;
    const y = ((clientY - rect.top) / rect.height) * viewBox.height;
    return { x, y };
  };

  const handleWheel = (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    const nextScale = Math.max(0.5, Math.min(2.5, zoom.scale + delta));
    const point = screenToSvg(event.clientX, event.clientY);
    const factor = nextScale / zoom.scale;
    const nextTx = point.x - (point.x - zoom.tx) * factor;
    const nextTy = point.y - (point.y - zoom.ty) * factor;
    applyZoom({ scale: nextScale, tx: nextTx, ty: nextTy });
  };

  const handlePointerDown = (event) => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(event.pointerId);
    pointerState.current.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragState.current.start = { x: event.clientX, y: event.clientY };
    dragState.current.moved = false;
    if (pointerState.current.pointers.size === 2) {
      const [first, second] = Array.from(pointerState.current.pointers.values());
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      pointerState.current.pinchStart = { distance, scale: zoom.scale };
      return;
    }
    pointerState.current.active = true;
    pointerState.current.start = { x: event.clientX, y: event.clientY };
    pointerState.current.startTranslate = { x: zoom.tx, y: zoom.ty };
  };

  const handlePointerMove = (event) => {
    if (!pointerState.current.pointers.has(event.pointerId)) return;
    pointerState.current.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (dragState.current.start) {
      const dx = Math.abs(event.clientX - dragState.current.start.x);
      const dy = Math.abs(event.clientY - dragState.current.start.y);
      if (dx > 4 || dy > 4) dragState.current.moved = true;
    }
    if (pointerState.current.pointers.size === 2 && pointerState.current.pinchStart) {
      const [first, second] = Array.from(pointerState.current.pointers.values());
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const factor = distance / pointerState.current.pinchStart.distance;
      applyZoom({ scale: pointerState.current.pinchStart.scale * factor });
      return;
    }
    if (!pointerState.current.active || !pointerState.current.start) return;
    const point = screenToSvg(event.clientX, event.clientY);
    const startPoint = screenToSvg(pointerState.current.start.x, pointerState.current.start.y);
    const dx = point.x - startPoint.x;
    const dy = point.y - startPoint.y;
    applyZoom({
      tx: (pointerState.current.startTranslate?.x || 0) + dx,
      ty: (pointerState.current.startTranslate?.y || 0) + dy,
    });
  };

  const handlePointerUp = (event) => {
    const svg = svgRef.current;
    if (svg) svg.releasePointerCapture(event.pointerId);
    pointerState.current.pointers.delete(event.pointerId);
    if (pointerState.current.pointers.size < 2) {
      pointerState.current.pinchStart = null;
    }
    pointerState.current.active = false;
  };

  const handleClick = (event) => {
    if (dragState.current.moved) return;
    const target = event.target?.closest?.('[data-tooth]');
    if (!target) return;
    const toothId = target.getAttribute('data-tooth');
    const surface = target.getAttribute('data-surface');
    if (!toothId) return;
    if (surface && surface !== 'BASE') {
      dispatch({ type: 'TOGGLE_SURFACE_DIRECT', payload: { id: toothId, surface } });
      return;
    }
    dispatch({ type: 'SELECT_TOOTH', payload: { id: toothId, openDrawer: true } });
  };

  return (
    <div className="odontogram-v2-canvas">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
        className="odontogram-v2-svg"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClick}
        role="img"
        aria-label="Odontograma V2"
      >
        <rect x="0" y="0" width={viewBox.width} height={viewBox.height} className="odontogram-v2-background" />
        <g transform={`translate(${zoom.tx} ${zoom.ty}) scale(${zoom.scale})`}>
          {positions.map((tooth) => {
            const data = state.teeth[tooth.id];
            const facePolygons = buildFacePolygons(tooth.x, tooth.y, tooth.size);
            const missing = isMissing(data?.status);
            const isSelected = state.selectedToothId === tooth.id;
            return (
              <g key={tooth.id} className={`odontogram-v2-tooth ${missing ? 'missing' : ''} ${isSelected ? 'selected' : ''}`}>
                <rect
                  x={tooth.x - tooth.size.width / 2}
                  y={tooth.y - tooth.size.height / 2}
                  width={tooth.size.width}
                  height={tooth.size.height}
                  rx="8"
                  className="odontogram-v2-tooth-base"
                  data-tooth={tooth.id}
                  data-surface="BASE"
                />
                {FACES.map((face) => {
                  const points = facePolygons[face];
                  const selected = Boolean(data?.surfaces?.[face]);
                  const fill = selected ? getSurfaceColor(data?.status) : 'transparent';
                  return (
                    <polygon
                      key={`${tooth.id}-${face}`}
                      points={polygonToString(points)}
                      className={`odontogram-v2-face ${selected ? 'active' : ''}`}
                      data-tooth={tooth.id}
                      data-surface={face}
                      style={{ fill }}
                    >
                      <title>{`Dente ${tooth.id} – Face ${face} (${FACE_LABELS[face]})`}</title>
                    </polygon>
                  );
                })}
                {data?.implant ? (
                  <circle
                    cx={tooth.x}
                    cy={tooth.y}
                    r={Math.max(6, Math.round(Math.min(tooth.size.width, tooth.size.height) * 0.18))}
                    className="odontogram-v2-implant"
                    pointerEvents="none"
                  />
                ) : null}
                {missing ? (
                  <g className="odontogram-v2-missing-overlay">
                    <line
                      x1={tooth.x - tooth.size.width / 2}
                      y1={tooth.y - tooth.size.height / 2}
                      x2={tooth.x + tooth.size.width / 2}
                      y2={tooth.y + tooth.size.height / 2}
                    />
                    <line
                      x1={tooth.x + tooth.size.width / 2}
                      y1={tooth.y - tooth.size.height / 2}
                      x2={tooth.x - tooth.size.width / 2}
                      y2={tooth.y + tooth.size.height / 2}
                    />
                  </g>
                ) : null}
                <text x={tooth.x} y={tooth.y + (tooth.labelOffset || -12)} className="odontogram-v2-label">
                  {tooth.id}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="odontogram-v2-controls">
        <button type="button" className="button secondary" onClick={() => applyZoom({ scale: zoom.scale + 0.1 })}>
          +
        </button>
        <button type="button" className="button secondary" onClick={() => applyZoom({ scale: zoom.scale - 0.1 })}>
          -
        </button>
        <button type="button" className="button secondary" onClick={() => applyZoom({ tx: 0, ty: 0 })}>
          Centralizar
        </button>
        <button type="button" className="button secondary" onClick={() => applyZoom({ scale: 1, tx: 0, ty: 0 })}>
          Reset zoom
        </button>
      </div>
    </div>
  );
}
