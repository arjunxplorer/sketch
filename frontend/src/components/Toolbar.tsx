/**
 * Drawing toolbar - sidebar with tool selection and settings.
 */

import { useDrawingSettings } from '../hooks/useDrawing';
import { useActiveTool, useSetActiveTool, useFillColor, useFontSize } from '../store/selectors';
import { useRoomStore } from '../store/roomStore';
import { ToolType, ToolTypeValue } from '../lib/protocol';
import { PEN_COLORS, STROKE_WIDTHS } from '../utils/colorUtils';

// Tool definitions with icons and shortcut tooltips
const TOOLS: { type: ToolTypeValue; icon: string; label: string; shortcut?: string }[] = [
  { type: ToolType.Select, icon: '↖', label: 'Select', shortcut: 'V' },
  { type: ToolType.Pan, icon: '✋', label: 'Pan', shortcut: 'H' },
  { type: ToolType.Pen, icon: '✏️', label: 'Pen', shortcut: 'P' },
  { type: ToolType.Line, icon: '/', label: 'Line', shortcut: 'L' },
  { type: ToolType.Arrow, icon: '→', label: 'Arrow', shortcut: 'A' },
  { type: ToolType.Rectangle, icon: '▢', label: 'Rectangle', shortcut: 'R' },
  { type: ToolType.Ellipse, icon: '○', label: 'Ellipse', shortcut: 'O' },
  { type: ToolType.Diamond, icon: '◇', label: 'Diamond', shortcut: 'D' },
  { type: ToolType.Text, icon: 'T', label: 'Text', shortcut: 'T' },
  { type: ToolType.Eraser, icon: '⌫', label: 'Eraser', shortcut: 'E' },
];

const FONT_SIZES = [14, 18, 20, 24, 28] as const;

export function Toolbar() {
  const { penColor, penWidth, setPenColor, setPenWidth } = useDrawingSettings();
  const activeTool = useActiveTool();
  const setActiveTool = useSetActiveTool();
  const fillColor = useFillColor();
  const setFillColor = useRoomStore((state) => state.setFillColor);
  const fontSize = useFontSize();
  const setFontSize = useRoomStore((state) => state.setFontSize);

  // Check if current tool supports fill
  const supportsFill = [ToolType.Rectangle, ToolType.Ellipse, ToolType.Diamond].includes(
    activeTool as typeof ToolType.Rectangle
  );

  // Check if Text tool is active (show font size)
  const supportsFontSize = activeTool === ToolType.Text;

  return (
    <div className="toolbar-sidebar">
      {/* Tools section */}
      <div className="toolbar-section">
        <span className="toolbar-label">Tools</span>
        <div className="tool-grid">
          {TOOLS.map((tool) => (
            <button
              key={tool.type}
              className={`tool-button ${activeTool === tool.type ? 'active' : ''}`}
              onClick={() => setActiveTool(tool.type)}
              title={tool.shortcut ? `${tool.label} — Shortcut: ${tool.shortcut}` : tool.label}
            >
              <span className="tool-icon">{tool.icon}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar-divider-h" />

      {/* Stroke color section */}
      <div className="toolbar-section">
        <span className="toolbar-label">Stroke</span>
        <div className="color-grid">
          {PEN_COLORS.map((color) => (
            <button
              key={color}
              className={`color-swatch ${penColor === color ? 'selected' : ''}`}
              style={{ backgroundColor: color }}
              onClick={() => setPenColor(color)}
              title={color}
            />
          ))}
        </div>
      </div>

      {/* Fill color section (for shapes) */}
      {supportsFill && (
        <>
          <div className="toolbar-divider-h" />
          <div className="toolbar-section">
            <span className="toolbar-label">Fill</span>
            <div className="color-grid">
              <button
                className={`color-swatch no-fill ${fillColor === null ? 'selected' : ''}`}
                onClick={() => setFillColor(null)}
                title="No fill"
              >
                <span className="no-fill-x">✕</span>
              </button>
              {PEN_COLORS.slice(0, 7).map((color) => (
                <button
                  key={color}
                  className={`color-swatch fill-swatch ${fillColor === color ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setFillColor(color)}
                  title={`Fill: ${color}`}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Font size section (when Text tool active) */}
      {supportsFontSize && (
        <>
          <div className="toolbar-divider-h" />
          <div className="toolbar-section">
            <span className="toolbar-label">Font</span>
            <div className="font-size-grid">
              {FONT_SIZES.map((size) => (
                <button
                  key={size}
                  className={`size-option font-size-option ${fontSize === size ? 'selected' : ''}`}
                  onClick={() => setFontSize(size)}
                  title={`Font size: ${size}px`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="toolbar-divider-h" />

      {/* Stroke width section */}
      <div className="toolbar-section">
        <span className="toolbar-label">Size</span>
        <div className="size-grid">
          {STROKE_WIDTHS.map((width) => (
            <button
              key={width}
              className={`size-option ${penWidth === width ? 'selected' : ''}`}
              onClick={() => setPenWidth(width)}
              title={`${width}px`}
            >
              <div
                className="size-dot"
                style={{
                  width: Math.min(width * 1.5, 14),
                  height: Math.min(width * 1.5, 14),
                  backgroundColor: penColor,
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
