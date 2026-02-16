/**
 * Resizable split panel sash component.
 * Handles mouse drag events to resize adjacent panels with 20-80% clamping.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

interface DraggableSashProps {
    onDrag: (newPosition: number) => void;
    onReset: () => void;
    onDragEnd?: (finalPosition: number) => void;
}

function DraggableSash({ onDrag, onReset, onDragEnd }: DraggableSashProps) {
    const sashRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    // Track cleanup function for document event listeners
    const cleanupRef = useRef<(() => void) | null>(null);

    // Cleanup on unmount to prevent event listener leaks
    useEffect(() => {
        return () => {
            // If unmounted during drag, clean up document listeners
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }
        };
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const container = sashRef.current?.parentElement;
            if (!container) {
                return;
            }

            const containerRect = container.getBoundingClientRect();
            const newPosition = ((moveEvent.clientX - containerRect.left) / containerRect.width) * 100;
            // Clamp to 20-80% range
            const clampedPosition = Math.max(20, Math.min(80, newPosition));
            onDrag(clampedPosition);
            // Store last position for onDragEnd
            (handleMouseMove as any).lastPosition = clampedPosition;
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            // Call onDragEnd with final position if provided
            if (onDragEnd && (handleMouseMove as any).lastPosition !== undefined) {
                onDragEnd((handleMouseMove as any).lastPosition);
            }
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            cleanupRef.current = null;
        };

        // Store cleanup function for potential unmount during drag
        cleanupRef.current = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [onDrag, onDragEnd]);

    return (
        <div
            ref={sashRef}
            className={`sash${isDragging ? ' dragging' : ''}`}
            onMouseDown={handleMouseDown}
            onDoubleClick={onReset}
            title="Drag to resize. Double-click to reset."
        />
    );
}

export const MemoizedDraggableSash = React.memo(DraggableSash);
