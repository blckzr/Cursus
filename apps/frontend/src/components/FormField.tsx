import { useState, type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';
import Icon from './Icon';

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

export function InputField({ label, hint, error, type, ...rest }: InputProps) {
  // Reveal-password toggle. Activates automatically whenever the caller asks
  // for `type='password'` — every existing password field across the app
  // gets the eye icon for free with no per-page changes.
  const isPassword = type === 'password';
  const [revealed, setRevealed] = useState(false);
  const effectiveType = isPassword && revealed ? 'text' : type;

  const inputClass = `input ${isPassword ? 'pr-10' : ''} ${error ? 'border-red-400 focus:border-red-500' : ''}`;

  return (
    <div>
      {label && <label className="label">{label}</label>}
      {isPassword ? (
        <div className="relative">
          <input className={inputClass} type={effectiveType} {...rest} />
          <button
            type="button"
            tabIndex={-1}                              // stay out of Tab order; the input itself is the focus target
            onClick={() => setRevealed(v => !v)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            title={revealed ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-stone-400 hover:text-olive-600 hover:bg-beige-100 transition-colors"
          >
            <Icon name={revealed ? 'eye-off' : 'eye'} size={15} />
          </button>
        </div>
      ) : (
        <input className={inputClass} type={effectiveType} {...rest} />
      )}
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
