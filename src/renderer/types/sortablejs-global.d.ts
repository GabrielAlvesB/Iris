import type SortableType from 'sortablejs';

declare global {
  const Sortable: typeof SortableType;
  type Sortable = SortableType;
  namespace Sortable {
    type SortableEvent = SortableType.SortableEvent;
    type Options = SortableType.Options;
  }
}

export {};

