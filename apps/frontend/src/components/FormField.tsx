import { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
}
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: ReactNode;
  children: ReactNode;
}

export function InputField({ label, hint, ...rest }: InputProps) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <input className="input" {...rest} />
      {hint && <p className="text-xs text-stone-400 mt-1">{hint}</p>}
    </div>
  );
}

export function SelectField({ label, hint, children, ...rest }: SelectProps) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <select className="input" {...rest}>{children}</select>
      {hint && <p className="text-xs text-stone-400 mt-1">{hint}</p>}
    </div>
  );
}
