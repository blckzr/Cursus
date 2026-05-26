import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  error?: string;
}
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}

export function InputField({ label, hint, error, ...rest }: InputProps) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <input className={`input ${error ? 'border-red-400 focus:border-red-500' : ''}`} {...rest} />
      {error
        ? <p className="text-xs text-red-600 mt-1">{error}</p>
        : hint && <p className="text-xs text-stone-400 mt-1">{hint}</p>}
    </div>
  );
}

export function SelectField({ label, hint, error, children, ...rest }: SelectProps) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <select className={`input ${error ? 'border-red-400 focus:border-red-500' : ''}`} {...rest}>
        {children}
      </select>
      {error
        ? <p className="text-xs text-red-600 mt-1">{error}</p>
        : hint && <p className="text-xs text-stone-400 mt-1">{hint}</p>}
    </div>
  );
}
