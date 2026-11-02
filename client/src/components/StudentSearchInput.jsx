import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

/**
 * Searchable student autocomplete input.
 * Matches by student name or registration number.
 * Displays the selected student's full name & reg number in the input.
 */
const StudentSearchInput = ({
  students = [],
  value,
  onChange,
  placeholder = 'Search by name or registration number...',
  disabled = false,
  inputClassName = '',
  formatLabel = (student) => `${student.name} (${student.reg_number})`,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const wrapperRef = useRef(null);

  const selectedStudent = useMemo(
    () => students.find((student) => String(student.id) === String(value)) || null,
    [students, value]
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return students.slice(0, 50);
    return students.filter((student) => {
      const name = String(student.name || '').toLowerCase();
      const regNumber = String(student.reg_number || '').toLowerCase();
      return name.includes(normalized) || regNumber.includes(normalized);
    }).slice(0, 50);
  }, [students, query]);

  // Close dropdown when clicking outside the wrapper.
  useEffect(() => {
    function handleOutsideClick(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  function selectStudent(student) {
    onChange(String(student.id));
    setQuery('');
    setOpen(false);
  }

  function handleInputChange(event) {
    const next = event.target.value;
    setQuery(next);
    setOpen(true);
    setHighlightedIndex(0);
    if (value) onChange('');
  }

  function handleKeyDown(event) {
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      if (filtered[highlightedIndex]) {
        event.preventDefault();
        selectStudent(filtered[highlightedIndex]);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const displayValue = open ? query : (selectedStudent ? formatLabel(selectedStudent) : '');

  return (
    <div ref={wrapperRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
      <input
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        disabled={disabled}
        value={displayValue}
        onChange={handleInputChange}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onKeyDown={handleKeyDown}
        placeholder={selectedStudent ? '' : placeholder}
        className={`${inputClassName} ${selectedStudent ? 'font-semibold text-indigo-700' : ''} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      />
      {selectedStudent && !disabled && (
        <button
          type="button"
          aria-label="Clear selected student"
          onClick={() => {
            onChange('');
            setQuery('');
            setOpen(true);
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <X size={16} />
        </button>
      )}

      {open && !disabled && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">No students match your search.</p>
          ) : (
            <ul role="listbox">
              {filtered.map((student, index) => (
                <li key={student.id} role="option" aria-selected={String(student.id) === String(value)}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectStudent(student)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition ${index === highlightedIndex ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                  >
                    <span className="font-medium truncate">{student.name}</span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      {student.reg_number || student.class_name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default StudentSearchInput;
