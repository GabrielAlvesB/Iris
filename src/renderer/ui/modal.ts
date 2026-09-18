export interface ModalFieldOption {
  value: string;
  label: string;
}

export interface ModalFieldSpec {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'select' | 'date' | 'datetime-local' | 'time' | 'weekdays';
  defaultValue?: string;
  placeholder?: string;
  options?: ModalFieldOption[];
  /** Used by type 'weekdays': short labels for each toggle, in day-index order (0 = Sunday). */
  weekdayLabels?: string[];
}

type FieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const DEFAULT_WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function buildWeekdaysField(field: ModalFieldSpec, wrap: HTMLElement): HTMLInputElement {
  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.value = field.defaultValue ?? '';

  const selected = new Set(
    (field.defaultValue ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v !== ''),
  );

  const picker = document.createElement('div');
  picker.className = 'modal-weekdays';

  const labels = field.weekdayLabels ?? DEFAULT_WEEKDAY_LABELS;
  labels.forEach((label, dayIndex) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'modal-weekday-toggle';
    btn.textContent = label;
    btn.classList.toggle('is-active', selected.has(String(dayIndex)));
    btn.addEventListener('click', () => {
      const key = String(dayIndex);
      if (selected.has(key)) {
        selected.delete(key);
      } else {
        selected.add(key);
      }
      btn.classList.toggle('is-active', selected.has(key));
      hidden.value = Array.from(selected)
        .map(Number)
        .sort((a, b) => a - b)
        .join(',');
    });
    picker.appendChild(btn);
  });

  wrap.appendChild(picker);
  return hidden;
}

let activeOverlay: HTMLElement | null = null;

function closeActiveModal(): void {
  activeOverlay?.remove();
  activeOverlay = null;
}

function buildFieldElement(field: ModalFieldSpec): FieldElement {
  if (field.type === 'textarea') {
    const textarea = document.createElement('textarea');
    textarea.value = field.defaultValue ?? '';
    if (field.placeholder) textarea.placeholder = field.placeholder;
    return textarea;
  }

  if (field.type === 'select') {
    const select = document.createElement('select');
    (field.options ?? []).forEach((option) => {
      const optionEl = document.createElement('option');
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      select.appendChild(optionEl);
    });
    select.value = field.defaultValue ?? '';
    return select;
  }

  const input = document.createElement('input');
  input.type =
    field.type === 'date' || field.type === 'datetime-local' || field.type === 'time' ? field.type : 'text';
  input.value = field.defaultValue ?? '';
  if (field.placeholder) input.placeholder = field.placeholder;
  return input;
}

export function openFormModal(
  title: string,
  fields: ModalFieldSpec[],
  submitLabel = 'Salvar',
): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    closeActiveModal();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    activeOverlay = overlay;

    function finish(result: Record<string, string> | null): void {
      document.removeEventListener('keydown', onKeyDown);
      closeActiveModal();
      resolve(result);
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') finish(null);
    }

    const modal = document.createElement('div');
    modal.className = 'modal';

    const heading = document.createElement('h2');
    heading.textContent = title;
    modal.appendChild(heading);

    const form = document.createElement('form');
    const inputs = new Map<string, FieldElement>();

    fields.forEach((field) => {
      const wrap = document.createElement('label');
      wrap.className = 'modal-field';

      const labelSpan = document.createElement('span');
      labelSpan.textContent = field.label;
      wrap.appendChild(labelSpan);

      const fieldEl = field.type === 'weekdays' ? buildWeekdaysField(field, wrap) : buildFieldElement(field);
      fieldEl.name = field.name;
      inputs.set(field.name, fieldEl);
      wrap.appendChild(fieldEl);

      form.appendChild(wrap);
    });

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', () => finish(null));
    actions.appendChild(cancelBtn);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'btn';
    submitBtn.textContent = submitLabel;
    actions.appendChild(submitBtn);

    form.appendChild(actions);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const values: Record<string, string> = {};
      inputs.forEach((fieldEl, name) => {
        values[name] = fieldEl.value;
      });
      finish(values);
    });

    modal.appendChild(form);
    overlay.appendChild(modal);

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) finish(null);
    });
    document.addEventListener('keydown', onKeyDown);

    document.body.appendChild(overlay);

    const firstField = fields[0];
    if (firstField) inputs.get(firstField.name)?.focus();
  });
}

export async function promptText(title: string, label: string, defaultValue = ''): Promise<string | null> {
  const result = await openFormModal(title, [{ name: 'value', label, type: 'text', defaultValue }]);
  return result ? result.value : null;
}

export interface ConfirmModalOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export function openConfirmModal(options: ConfirmModalOptions | string): Promise<boolean> {
  const opts: ConfirmModalOptions = typeof options === 'string' ? { message: options } : options;
  const isDanger = opts.danger !== false;
  const title = opts.title ?? (isDanger ? 'Confirmar exclusão' : 'Confirmar ação');
  const confirmText = opts.confirmText ?? (isDanger ? 'Excluir' : 'Confirmar');
  const cancelText = opts.cancelText ?? 'Cancelar';

  return new Promise((resolve) => {
    closeActiveModal();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    activeOverlay = overlay;

    function finish(result: boolean): void {
      document.removeEventListener('keydown', onKeyDown);
      closeActiveModal();
      resolve(result);
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') finish(false);
    }

    const modal = document.createElement('div');
    modal.className = `modal modal-confirm${isDanger ? ' modal-confirm--danger' : ''}`;

    const iconWrap = document.createElement('div');
    iconWrap.className = 'modal-confirm-icon-wrap';
    iconWrap.innerHTML = isDanger
      ? `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>`
      : `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>`;
    modal.appendChild(iconWrap);

    const contentWrap = document.createElement('div');
    contentWrap.className = 'modal-confirm-content';

    const heading = document.createElement('h2');
    heading.className = 'modal-confirm-title';
    heading.textContent = title;
    contentWrap.appendChild(heading);

    const messageEl = document.createElement('p');
    messageEl.className = 'modal-confirm-message';
    messageEl.textContent = opts.message;
    contentWrap.appendChild(messageEl);

    const actions = document.createElement('div');
    actions.className = 'modal-actions modal-confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = cancelText;
    cancelBtn.addEventListener('click', () => finish(false));
    actions.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = isDanger ? 'btn btn-danger' : 'btn';
    confirmBtn.textContent = confirmText;
    confirmBtn.addEventListener('click', () => finish(true));
    actions.appendChild(confirmBtn);

    contentWrap.appendChild(actions);
    modal.appendChild(contentWrap);
    overlay.appendChild(modal);

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) finish(false);
    });
    document.addEventListener('keydown', onKeyDown);

    document.body.appendChild(overlay);
    confirmBtn.focus();
  });
}

