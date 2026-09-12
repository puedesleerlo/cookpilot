import { useId, useRef, useState } from 'react';
import { searchLexicon, type LexiconMatch } from '@kitchen/domain';
import { Glyph, INGREDIENT_GLYPH } from '../primitives';

/**
 * Adding one ingredient.
 *
 * A combobox over the lexicon, and deliberately nothing cleverer. The consolidated delta
 * deleted the free-text intake, and the thing it deleted is what this becomes the moment it
 * tries to read a sentence: "chicken and rice" would find both, "chicken stock" would find
 * chicken, and the user ends up with a plan built on food they do not have. One term, a
 * list of candidates, a person choosing.
 *
 * The escape hatch matters as much as the list. Anything the lexicon has never heard of can
 * still be added, verbatim and flagged — a fridge is not obliged to contain only things we
 * have written down.
 */

type Props = {
  /** Returns false when the ingredient was already in the pantry. */
  onAdd: (name: string) => boolean;
  /** Names already taken, so the list never offers them twice. */
  taken: string[];
};

export const IngredientSearch = ({ onAdd, taken }: Props) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [note, setNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  /*
   * Matches stay listed after they are taken, ticked.
   *
   * Filtering them out closed the list on every pick, so adding seven things meant typing
   * seven times. Keeping them means the list survives a selection and a run of related
   * things — "pepper", then the other pepper — can be taken in one go, with what you
   * already have visible rather than inferred from the list getting shorter.
   */
  const held = new Set(taken);
  const matches = searchLexicon(query, 7);
  const typed = query.trim();
  const exact = matches.some((m) => m.entry.canonicalName === typed.toLowerCase());
  const options: (LexiconMatch | 'verbatim')[] =
    typed.length > 0 && !exact ? [...matches, 'verbatim'] : matches;

  const take = (option: LexiconMatch | 'verbatim'): void => {
    const name = option === 'verbatim' ? typed : option.entry.canonicalName;
    const added = onAdd(name);
    // Typing a whole new word is the signal to move on, not picking one thing.
    if (option === 'verbatim') setQuery('');
    setNote(added ? '' : `${name} is already in the fridge.`);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (options.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = options[active] ?? options[0];
      if (option) take(option);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="text-xs font-bold text-ink-soft">
        What is in there?
      </label>
      <input
        id={id}
        ref={inputRef}
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        placeholder="chicken, bok choy, half a lemon…"
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setNote('');
        }}
        onKeyDown={onKeyDown}
        className="mt-1 min-h-[56px] w-full rounded-sm border-[1.5px] border-line-strong bg-cream px-4 py-3
          font-ui text-md text-charcoal placeholder:text-ink-faint"
      />

      {options.length > 0 ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label="Matching ingredients"
          className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-sm border-[1.5px]
            border-line-strong bg-cream shadow-2"
        >
          {options.map((option, i) => {
            const isVerbatim = option === 'verbatim';
            const name = isVerbatim ? typed : option.entry.canonicalName;
            return (
              <li key={isVerbatim ? '__verbatim' : option.entry.canonicalName} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => take(option)}
                  className={`flex min-h-[44px] w-full items-center gap-3 px-3 py-2 text-left text-sm
                    ${i === active ? 'bg-cream-deep' : 'bg-cream'}
                    ${!isVerbatim && held.has(option.entry.canonicalName) ? 'text-ink-soft' : ''}`}
                >
                  <span className={isVerbatim ? 'text-ink-faint' : 'text-sage-ink'}>
                    <Glyph
                      name={isVerbatim ? 'state-empty' : INGREDIENT_GLYPH[option.entry.category]}
                      size={22}
                    />
                  </span>
                  {isVerbatim ? (
                    <span>
                      Add <strong>{typed}</strong> anyway
                      <span className="block text-xs text-ink-soft">
                        Kept as you typed it. It will not match a recipe, but it will not be
                        turned into something else either.
                      </span>
                    </span>
                  ) : (
                    <span className="flex-1">
                      <span className="font-semibold">{name}</span>
                      {option.matched !== name ? (
                        <span className="ml-2 text-xs text-ink-soft">you said {option.matched}</span>
                      ) : null}
                    </span>
                  )}
                  {!isVerbatim && held.has(option.entry.canonicalName) ? (
                    <span
                      aria-label="already in the fridge"
                      className="flex-none rounded-xs bg-sage-wash px-2 text-xs font-bold text-sage-ink"
                    >
                      added
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="mt-1 min-h-[1.2em] text-xs text-ink-soft" role="status">
        {note || (options.length > 0 ? 'Pick as many as you like. Esc closes the list.' : '')}
      </p>
    </div>
  );
};
