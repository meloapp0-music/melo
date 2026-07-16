// SortableMediaGrid — drag-to-reorder for the photo/video pickers.
// ================================================================
// Order is load-bearing, not cosmetic: `photos[0]` is the share card's hero,
// the og:image in every link preview, AND the poster for videos on the public
// show page. Before this, the only way to change the cover was to delete
// everything and re-upload in order.
//
// Why dnd-kit and not a hand-rolled pointer-event drag: this grid lives inside
// LogShow's scrollable form, so a drag that activates on touch-down fights page
// scroll. Disambiguating "scrolling" from "dragging" needs a long-press
// activation delay, and getting that right on real iOS touch is exactly what
// can't be verified from a dev machine. dnd-kit's TouchSensor does it properly.
//
// The parent stays the owner of the array — we only ever call `onReorder(next)`,
// matching the pickers' existing controlled-component contract.

import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor,
  useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableTile({ id, children }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`sortable-tile${isDragging ? ' is-dragging' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // Lift the dragged tile above its neighbours.
        zIndex: isDragging ? 2 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

export default function SortableMediaGrid({ ids, onReorder, renderTile, children }) {
  const sensors = useSensors(
    // Mouse/trackpad: a small movement threshold so a click still removes.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Touch: long-press to pick up. Without the delay, dragging a tile would
    // steal vertical page scroll inside the log form.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        {ids.map((id, i) => (
          <SortableTile key={id} id={id}>
            {renderTile(id, i)}
          </SortableTile>
        ))}
      </SortableContext>
      {/* Non-sortable extras (in-flight uploads, the add button) render after
          the sortable set so they can't become drop targets. */}
      {children}
    </DndContext>
  );
}
