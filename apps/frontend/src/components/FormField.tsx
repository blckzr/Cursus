import { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> { label: string; }
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { label: string; children: ReactNode; }

export function InputField({ label, ...props }: InputProps) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" {...props} />
    </div>
  );
}

export function SelectField({ label, children, ...props }: SelectProps) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="input" {...props}>{children}</select>
    </div>
  );
}
