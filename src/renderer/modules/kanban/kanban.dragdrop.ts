import * as kanbanState from './kanban.state.js';

let activeInstances: InstanceType<typeof Sortable>[] = [];

export function destroySortables(): void {
  activeInstances.forEach((instance) => instance.destroy());
  activeInstances = [];
}

export function initSortables(boardEl: HTMLElement): void {
  destroySortables();

  const columnsContainer = boardEl.querySelector<HTMLElement>('.kanban-columns');
  if (columnsContainer) {
    activeInstances.push(
      new Sortable(columnsContainer, {
        animation: 150,
        handle: '.kanban-column-header',
        draggable: '.kanban-column',
        onEnd: () => {
          const orderedColumnIds = Array.from(columnsContainer.querySelectorAll<HTMLElement>('.kanban-column')).map(
            (el) => el.dataset.columnId as string,
          );
          void kanbanState.reorderColumns({ orderedColumnIds });
        },
      }),
    );
  }

  boardEl.querySelectorAll<HTMLElement>('.kanban-card-list').forEach((listEl) => {
    activeInstances.push(
      new Sortable(listEl, {
        group: 'kanban-cards',
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: (evt) => {
          const cardId = evt.item.dataset.cardId;
          const toColumnId = evt.to.dataset.columnId;
          const toIndex = evt.newIndex;
          if (!cardId || !toColumnId || toIndex === undefined) return;
          void kanbanState.moveCard({ cardId, toColumnId, toIndex });
        },
      }),
    );
  });
}
