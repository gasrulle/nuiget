/**
 * Resizable split panel sash component.
 * Handles mouse drag events to resize adjacent panels with 20-80% clamping.
 * Supports both horizontal (col-resize) and vertical (row-resize) orientations.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

interface DraggableSashProps {
    onDrag: (newPosition: number) => void;
    onReset: () => void;
    onDragEnd?: (finalPosition: number) => void;
    /** 'horizontal' = vertical sash line (col-resize), 'vertical' = horizontal sash line (row-resize). Default: 'horizontal'. */
    orientation?: 'horizontal' | 'vertical';
}

function DraggableSash({ onDrag, onReset, onDragEnd, orientation = 'horizontal' }: DraggableSashProps) {
    const sashRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    // Track cleanup function for document event listeners
    const cleanupRef = useRef<(() => void) | null>(null);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cleanup on unmount to prevent event listener leaks
    useEffect(() => {
        return () => {
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }
            if (hoverTimerRef.current) {
                clearTimeout(hoverTimerRef.current);
            }
        };
    }, []);

    const handleMouseEnter = useCallback(() => {
        if (isDragging) {
            setIsHovered(true);
            return;
        }
        hoverTimerRef.current = setTimeout(() => setIsHovered(true), 300);
    }, [isDragging]);

    const handleMouseLeave = useCallback(() => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
        setIsHovered(false);
    }, []);

    const isVertical = orientation === 'vertical';
    const cursorStyle = isVertical ? 'row-resize' : 'col-resize';

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);

        let lastPosition: number | undefined;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const container = sashRef.current?.parentElement;
            if (!container) {
                return;
            }

            const containerRect = container.getBoundingClientRect();
            const newPosition = isVertical
                ? ((moveEvent.clientY - containerRect.top) / containerRect.height) * 100
                : ((moveEvent.clientX - containerRect.left) / containerRect.width) * 100;
            // Clamp to 20-80% range
            const clampedPosition = Math.max(20, Math.min(80, newPosition));
            onDrag(clampedPosition);
            lastPosition = clampedPosition;
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            // Call onDragEnd with final position if provided
            if (onDragEnd && lastPosition !== undefined) {
                onDragEnd(lastPosition);
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
        document.body.style.cursor = cursorStyle;
        document.body.style.userSelect = 'none';
    }, [onDrag, onDragEnd, isVertical, cursorStyle]);

    return (
        <div
            ref={sashRef}
            className={`sash${isDragging ? ' dragging' : ''}${isHovered ? ' hover' : ''}${isVertical ? ' sash-vertical' : ''}`}
            role="separator"
            aria-orientation={isVertical ? 'horizontal' : 'vertical'}
            aria-label="Drag to resize panels"
            onMouseDown={handleMouseDown}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onDoubleClick={onReset}
            title="Drag to resize. Double-click to reset."
        />
    );
}

export const MemoizedDraggableSash = React.memo(DraggableSash);
