import { useState, useRef, useCallback } from 'react';

export function useHistory(initialValue: string) {
  const [value, setValue] = useState(initialValue);
  const historyRef = useRef<string[]>([initialValue]);
  const pointerRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const push = useCallback((newValue: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const current = historyRef.current;
      if (current[pointerRef.current] !== newValue) {
        if (pointerRef.current < current.length - 1) {
          historyRef.current = current.slice(0, pointerRef.current + 1);
        }
        historyRef.current.push(newValue);
        if (historyRef.current.length > 50) historyRef.current.shift();
        pointerRef.current = historyRef.current.length - 1;
      }
      setValue(newValue);
    }, 500);
  }, []);

  const undo = useCallback(() => {
    if (pointerRef.current > 0) {
      pointerRef.current--;
      setValue(historyRef.current[pointerRef.current]);
    }
  }, []);

  const redo = useCallback(() => {
    if (pointerRef.current < historyRef.current.length - 1) {
      pointerRef.current++;
      setValue(historyRef.current[pointerRef.current]);
    }
  }, []);

  return { value, setValue, push, undo, redo, canUndo: pointerRef.current > 0, canRedo: pointerRef.current < historyRef.current.length - 1 };
}