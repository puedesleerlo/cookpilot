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
 *
 * Drawn as Makitra's search field, with the matches on a dark label-maker strip: the one
 * ground on this screen nothing else uses, so the list reads as lying over the table
 * without a shadow to hold it up.
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
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-md font-bold text-ink [font-variation-settings:var(--mk-sharp)]"
      >
        What is in there?
      </label>

      <div className="relative">
        <div className="mk-search">
          <svg viewBox="0 0 24 24" className="mk-icon !left-5" aria-hidden="true">
            <polygon points="10.5,3.5 15.4,5.5 17.5,10.5 15.4,15.4 10.5,17.5 5.6,15.4 3.5,10.5 5.6,5.5" />
            <path d="M15.8 15.8l4.7 4.7" />
          </svg>
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
            className="mk-field__control min-h-[64px] !rounded-nick-lg !pl-[3.75rem] text-md"
          />
        </div>

        <p className="mt-2 min-h-[1.5em] text-xs text-muted" role="status">
          {note || (options.length > 0 ? 'Pick as many as you like. Esc closes the list.' : '')}
        </p>

        {options.length > 0 ? (
          <ul
            id={`${id}-list`}
            role="listbox"
            aria-label="Matching ingredients"
            className="absolute left-0 right-0 top-full z-30 mt-1 flex flex-col gap-1 rounded-nick-lg bg-plum-900 p-2
              text-paper [--mk-focus:var(--mk-night-focus)]"
          >
            {options.map((option, i) => {
              const isVerbatim = option === 'verbatim';
              const name = isVerbatim ? typed : option.entry.canonicalName;
              const have = !isVerbatim && held.has(option.entry.canonicalName);
              return (
                <li key={isVerbatim ? '__verbatim' : option.entry.canonicalName} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => take(option)}
                    className={`flex min-h-touch w-full items-center gap-3 rounded-nick-md px-2 py-2 text-left text-sm
                      transition-colors duration-fast
                      ${i === active ? 'bg-mk-plum' : 'bg-transparent'}
                      ${have ? 'text-night-muted' : 'text-paper'}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`grid h-[40px] w-[40px] flex-none place-items-center [clip-path:var(--mk-cut-plate)]
                        ${isVerbatim ? 'bg-flour-deep text-plum-900' : have ? 'bg-enamel text-plum-900' : 'bg-garden-100 text-garden-700'}`}
                    >
                      <Glyph
                        name={isVerbatim ? 'state-empty' : INGREDIENT_GLYPH[option.entry.category]}
                        size={24}
                      />
                    </span>
                    {isVerbatim ? (
                      <span>
                        Add <strong>{typed}</strong> anyway
                        <span className="block text-xs text-night-muted">
                          Kept as you typed it. It will not match a recipe, but it will not be
                          turned into something else either.
                        </span>
                      </span>
                    ) : (
                      <span className="flex-1">
                        <span className="font-semibold [font-variation-settings:var(--mk-sharp)]">{name}</span>
                        {option.matched !== name ? (
                          <span className="ml-2 text-xs text-night-muted">you said {option.matched}</span>
                        ) : null}
                      </span>
                    )}
                    {have ? (
                      <span
                        aria-label="already in the fridge"
                        className="mk-tag flex-none -rotate-3 [--tag-bg:var(--mk-enamel)] [--tag-fg:var(--mk-plum-900)]"
                      >
                        <svg viewBox="0 0 24 24" className="mk-icon" aria-hidden="true">
                          <polyline points="4.5,12.5 9.5,17.5 19.5,6.5" />
                        </svg>
                        added
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
};
