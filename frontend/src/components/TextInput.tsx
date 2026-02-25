/**
 * Inline text input component for the canvas.
 * Appears at click location for direct text entry.
 * Supports auto-resize, multi-line (Shift+Enter), click outside to confirm.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

interface TextInputProps {
  x: number;
  y: number;
  fontSize: number;
  color: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function TextInput({ x, y, fontSize, color, onSubmit, onCancel }: TextInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Ensure text is visible - use white if color is too dark
  const displayColor = color === '#000000' ? '#ffffff' : color;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-resize textarea to fit content
  const adjustHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;

    el.style.height = 'auto';
    const newHeight = Math.max(fontSize + 16, el.scrollHeight);
    el.style.height = `${newHeight}px`;
  }, [fontSize]);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter without Shift = submit
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) {
        onSubmit(text);
      } else {
        onCancel();
      }
    }
    // Shift+Enter = new line (default textarea behavior)
    else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  // Click outside (blur) = confirm if has content
  const handleBlur = () => {
    if (text.trim()) {
      onSubmit(text);
    } else {
      onCancel();
    }
  };

  return (
    <textarea
      ref={inputRef}
      className="canvas-text-input"
      value={text}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        fontSize: `${fontSize}px`,
        color: displayColor,
        fontFamily: "'JetBrains Mono', monospace",
        background: 'rgba(42, 42, 42, 0.9)',
        border: '2px solid rgba(99, 102, 241, 0.8)',
        borderRadius: '4px',
        outline: 'none',
        resize: 'none',
        minWidth: '150px',
        minHeight: `${fontSize + 16}px`,
        padding: '4px 8px',
        overflow: 'hidden',
        lineHeight: 1.4,
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
      }}
      placeholder="Type here. Enter to confirm, Shift+Enter for new line"
    />
  );
}
