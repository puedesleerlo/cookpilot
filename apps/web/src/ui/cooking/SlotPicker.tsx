import type { Slot } from '@/app/story';
import { roleOf } from '@/app/story';
import { Glyph, cookGlyph } from '../primitives';
import { cookColor } from '../theme';

/**
 * "Which one are you?"
 *
 * The compiled crew is a list of roles, not people: the first cook is assumed to know the
 * kitchen and the rest to be helping, and the schedule was built on that. Joining means
 * picking the role you are going to play tonight, so the phone shows you that role's steps
 * and nobody else's. A role someone has already taken says who, and cannot be taken twice.
 */
type Props = {
  slots: Slot[];
  selected: string | null;
  onSelect: (cookId: string) => void;
  myDeviceId: string | null;
};

export const SlotPicker = ({ slots, selected, onSelect, myDeviceId }: Props) => (
  <div role="radiogroup" aria-label="Which cook are you" className="grid gap-2 sm:grid-cols-2">
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
          className={`flex min-h-[72px] items-center gap-3 rounded-md border-[1.5px] p-3 text-left
            transition-colors duration-fast
            ${on ? 'border-tomato-deep bg-cream shadow-2' : 'border-line bg-cream/60 hover:border-line-strong'}
            disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <span style={{ color: cookColor(index) }} className="flex-none">
            <Glyph name={cookGlyph(index)} size={40} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-md font-bold text-charcoal">{cook.name}</span>
            <span className="block text-xs text-ink-soft">{roleOf(cook)}</span>
            <span className="block text-xs font-semibold">
              {member ? (
                <span className={mine ? 'text-sage-ink' : 'text-tomato-ink'}>
                  {mine ? `that's you, ${member.displayName}` : `${member.displayName} has this one`}
                </span>
              ) : (
                <span className="text-ink-faint">free</span>
              )}
            </span>
          </span>
        </button>
      );
    })}
  </div>
);
