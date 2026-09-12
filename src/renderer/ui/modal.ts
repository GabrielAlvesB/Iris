export interface ModalFieldOption {
  value: string;
  label: string;
}

export interface ModalFieldSpec {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'select' | 'date' | 'datetime-local';
  defaultValue?: string;
  placeholder?: string;
  options?: ModalFieldOption[];
}

type FieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

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
  input.type = field.type === 'date' || field.type === 'datetime-local' ? field.type : 'text';
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

      const fieldEl = buildFieldElement(field);
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
