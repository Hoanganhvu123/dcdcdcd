import * as React from 'react';
import { ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AutocompleteProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const AutocompleteContext = React.createContext<{
  value?: string;
  onValueChange?: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}>({
  open: false,
  setOpen: () => {},
  searchTerm: '',
  setSearchTerm: () => {},
});

export const Autocomplete = React.forwardRef<HTMLDivElement, AutocompleteProps>(
  ({ className, value, onValueChange, open: controlledOpen, onOpenChange, children, ...props }, ref) => {
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState('');
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : uncontrolledOpen;

    const setOpen = React.useCallback(
      (nextOpen: boolean) => {
        if (!isControlled) {
          setUncontrolledOpen(nextOpen);
        }
        onOpenChange?.(nextOpen);
      },
      [isControlled, onOpenChange]
    );

    return (
      <AutocompleteContext.Provider
        value={{
          value,
          onValueChange,
          open,
          setOpen,
          searchTerm,
          setSearchTerm,
        }}
      >
        <div ref={ref} data-slot="autocomplete" className={cn('relative w-full', className)} {...props}>
          {children}
        </div>
      </AutocompleteContext.Provider>
    );
  }
);
Autocomplete.displayName = 'Autocomplete';

export interface AutocompleteInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  showTrigger?: boolean;
  showClear?: boolean;
  startAddon?: React.ReactNode;
}

export const AutocompleteInput = React.forwardRef<HTMLInputElement, AutocompleteInputProps>(
  ({ className, showTrigger = false, showClear = false, startAddon, value, onChange, ...props }, ref) => {
    const { searchTerm, setSearchTerm, setOpen, onValueChange } = React.useContext(AutocompleteContext);

    const inputValue = value !== undefined ? value : searchTerm;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchTerm(e.target.value);
      setOpen(true);
      onChange?.(e);
    };

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      setSearchTerm('');
      onValueChange?.('');
    };

    return (
      <div className="relative flex w-full items-center" data-slot="autocomplete-input-group">
        {startAddon && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3 text-muted-foreground"
            data-slot="autocomplete-start-addon"
          >
            {startAddon}
          </div>
        )}
        <input
          ref={ref}
          type="text"
          value={inputValue}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          data-slot="autocomplete-input"
          className={cn(
            'flex h-9 w-full rounded-xl border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            startAddon && 'pl-9',
            (showTrigger || showClear) && 'pr-8',
            className
          )}
          {...props}
        />
        {showClear && searchTerm && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            data-slot="autocomplete-clear"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}
        {showTrigger && !searchTerm && (
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" data-slot="autocomplete-trigger">
            <ChevronsUpDown className="h-3.5 w-3.5" strokeWidth={1.5} />
          </div>
        )}
      </div>
    );
  }
);
AutocompleteInput.displayName = 'AutocompleteInput';

export function AutocompletePopup({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open } = React.useContext(AutocompleteContext);
  if (!open) return null;

  return (
    <div
      className={cn(
        'absolute top-full z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95',
        className
      )}
      data-slot="autocomplete-popup"
      {...props}
    >
      {children}
    </div>
  );
}

export function AutocompleteItem({
  className,
  children,
  value,
  onSelect,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value?: string; onSelect?: (value: string) => void }) {
  const { onValueChange, setOpen, setSearchTerm } = React.useContext(AutocompleteContext);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (value !== undefined) {
      setSearchTerm(value);
      onValueChange?.(value);
      onSelect?.(value);
    }
    setOpen(false);
    props.onClick?.(e);
  };

  return (
    <div
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-lg px-2.5 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      onClick={handleClick}
      data-slot="autocomplete-item"
      {...props}
    >
      {children}
    </div>
  );
}

export function AutocompleteSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('-mx-1 my-1 h-px bg-muted', className)} data-slot="autocomplete-separator" {...props} />;
}

export function AutocompleteGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('overflow-hidden p-1 text-foreground', className)} data-slot="autocomplete-group" {...props} />;
}

export function AutocompleteGroupLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-2 py-1.5 text-xs font-semibold text-muted-foreground', className)} data-slot="autocomplete-group-label" {...props} />;
}

export function AutocompleteEmpty({ className, children = 'No results found.', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('py-6 text-center text-sm text-muted-foreground', className)} data-slot="autocomplete-empty" {...props}>
      {children}
    </div>
  );
}

export function AutocompleteRow({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center', className)} data-slot="autocomplete-row" {...props} />;
}

export function AutocompleteValue({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  const { value } = React.useContext(AutocompleteContext);
  return <span data-slot="autocomplete-value" className={className} {...props}>{value}</span>;
}

export function AutocompleteList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-0.5', className)} data-slot="autocomplete-list" {...props} />;
}

export function AutocompleteClear({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cn('inline-flex items-center justify-center p-1', className)} data-slot="autocomplete-clear" {...props}>
      <X className="h-3.5 w-3.5" strokeWidth={1.5} />
    </button>
  );
}

export function AutocompleteStatus({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-3 py-2 text-xs font-medium text-muted-foreground', className)} data-slot="autocomplete-status" {...props} />;
}

export function AutocompleteCollection({ ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="autocomplete-collection" {...props} />;
}

export function AutocompleteTrigger({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, setOpen } = React.useContext(AutocompleteContext);
  return (
    <button
      type="button"
      className={cn('inline-flex items-center justify-center', className)}
      data-slot="autocomplete-trigger"
      onClick={() => setOpen(!open)}
      {...props}
    >
      {children || <ChevronsUpDown className="h-4 w-4" strokeWidth={1.5} />}
    </button>
  );
}

export function useAutocompleteFilter() {
  return React.useCallback((items: string[], term: string) => {
    if (!term) return items;
    const lower = term.toLowerCase();
    return items.filter((item) => item.toLowerCase().includes(lower));
  }, []);
}
