import { useRef, useEffect, useCallback } from 'react';

/**
 * Canvas para captura de assinatura com mouse/touch.
 */
export default function SignatureCanvas({ width = 480, height = 160, onChange, className = '' }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  const getPoint = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const clientY = e.touches?.[0]?.clientY ?? e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  const emitChange = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onChange) return;
    onChange(canvas.toDataURL('image/png'));
  }, [onChange]);

  const startDraw = useCallback((e) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    const { x, y } = getPoint(e);
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  }, [getPoint]);

  const draw = useCallback((e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    const { x, y } = getPoint(e);
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }, [getPoint]);

  const endDraw = useCallback((e) => {
    if (!drawing.current) return;
    e.preventDefault();
    drawing.current = false;
    emitChange();
  }, [emitChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }, [width, height]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    onChange?.('');
  };

  return (
    <div className={`ctr-signature-canvas-wrap ${className}`}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="ctr-signature-canvas"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
        aria-label="Área de assinatura"
      />
      <button type="button" className="button small secondary ctr-signature-clear" onClick={clear}>
        Limpar assinatura
      </button>
    </div>
  );
}
