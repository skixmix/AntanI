interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title?: string;
}

export function Switch({ checked, onChange, title }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 appearance-none rounded-full border-0 p-0 outline-none transition-colors ${
        checked ? "bg-primary" : "bg-secondary"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}
