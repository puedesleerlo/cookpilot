import type { Slot } from '@/app/story';
import { roleOf } from '@/app/story';
import { Glyph, cookGlyph } from '../primitives';
import { cookColor } from '../theme';
import { Icon } from './Paper';

/**
 * "Which one are you?"
 *
 * The compiled crew is a list of roles, not people: the first cook is assumed to know the
 * kitchen and the rest to be helping, and the schedule was built on that. Joining means
 * picking the role you are going to play tonight, so the phone shows you that role's steps
 * and nobody else's. A role someone has already taken says who, and cannot be taken twice.
 *
 * Each role is a party name tag: a band in the cook's colour, the role in big letters, and
 * who has it. The tag is a button, so it keeps nick corners — the cuts live on the band.
 */
type Props = {
  slots: Slot[];
  selected: string | null;
  onSelect: (cookId: string) => void;
  myDeviceId: string | null;
};

export const SlotPicker = ({ slots, selected, onSelect, myDeviceId }: Props) => (
  <div role="radiogroup" aria-label="Which cook are you" className="grid gap-4 sm:grid-cols-2">
    {slots.map(({ cook, index, member }) => {
      const mine = member?.deviceId === myDeviceId;
      const taken = member !== null && !mine;
      const on = selected === cook.id;
      return (
        <button
          key={cook.id}
          type="button"
          role="radio"
          aria-checked={on}
          disabled={taken}
          onClick={() => onSelect(cook.id)}
          className={`group relative flex min-h-[112px] flex-col overflow-hidden rounded-nick-md text-left
            transition-[rotate,background-color] duration-base ease-stamp
            ${
              on
                ? 'bg-selected text-on-selected [rotate:-1.5deg]'
                : 'bg-surface text-ink shadow-[inset_0_0_0_2px_var(--mk-line-strong)] enabled:hover:[rotate:1deg]'
            }
            disabled:cursor-not-allowed disabled:bg-sunken disabled:shadow-none`}
        >
          <span aria-hidden="true" className="relative block">
            <span className="flex h-[2rem] items-center justify-between px-3 text-paper" style={{ background: cookColor(index) }}>
              <span className="text-[0.6875rem] font-bold uppercase tracking-[0.2em] [font-variation-settings:var(--mk-sharp)]">
                Hello, I&rsquo;m
              </span>
              {on ? (
                <span className="grid h-5 w-5 place-items-center bg-marigold text-charcoal [clip-path:var(--mk-cut-plate)] motion-safe:animate-[mk-stamp_var(--d-slow)_var(--mk-ease-stamp)_both]">
                  <Icon name="check" className="!h-4 !w-4 [stroke-width:3]" />
                </span>
              ) : null}
            </span>
            <span className="block h-2 [clip-path:var(--mk-cut-edge-bottom)]" style={{ background: cookColor(index) }} />
          </span>
          <span className={`flex flex-1 items-center gap-3 px-3 pb-3 pt-1 ${taken ? 'opacity-70' : ''}`}>
            <span
              className="flex-none"
              style={{ color: on ? 'var(--mk-paper)' : cookColor(index) }}
            >
              <Glyph name={cookGlyph(index)} size={44} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[length:var(--mk-text-lg)] font-extrabold leading-tight [font-variation-settings:var(--mk-sharp)]">
                {cook.name}
              </span>
              <span className={`block text-xs ${on ? 'text-on-selected' : 'text-muted'}`}>{roleOf(cook)}</span>
              <span className="mt-2 block">
                {member ? (
                  mine ? (
                    <span className="mk-tag mk-tag--success whitespace-normal">
                      <Icon name="check" />
                      {`that's you, ${member.displayName}`}
                    </span>
                  ) : (
                    <span className="mk-tag whitespace-normal bg-plum-100 text-mk-plum">
                      <Icon name="lock" />
                      {`${member.displayName} has this one`}
                    </span>
                  )
                ) : (
                  <span className="mk-tag bg-cornflower-100 text-cornflower-700">
                    <Icon name="plus" />
                    free
                  </span>
                )}
              </span>
            </span>
          </span>
        </button>
      );
    })}
  </div>
);
