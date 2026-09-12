import beet from '@/assets/makitra/ingredients/beet.svg';
import cabbage from '@/assets/makitra/ingredients/cabbage.svg';
import carrot from '@/assets/makitra/ingredients/carrot.svg';
import cherries from '@/assets/makitra/ingredients/cherries.svg';
import dill from '@/assets/makitra/ingredients/dill.svg';
import garlic from '@/assets/makitra/ingredients/garlic.svg';
import mushroom from '@/assets/makitra/ingredients/mushroom.svg';
import tomato from '@/assets/makitra/ingredients/tomato.svg';
import cucumber from '@/assets/makitra/ingredients/cucumber.svg';
import potato from '@/assets/makitra/ingredients/potato.svg';
import bag from '@/assets/makitra/illustrations/empty-shopping.svg';
import { Motif } from '../../primitives';

/**
 * A grocery bag, dropped: one fridge's worth of shopping tumbling across the poster.
 *
 * Laid out in a square, in percentages of that square, so the whole still life scales as a
 * piece and each breakpoint only decides where the square sits and how much the viewport
 * crops off. Every piece stamps down once, in the order things would land; nothing moves
 * after that. Decoration only — hidden from assistive technology.
 */

const STAMP = 'motion-safe:animate-[mk-stamp_560ms_var(--mk-ease-stamp)_both]';
const SLIDE = 'motion-safe:animate-[mk-slide_620ms_var(--mk-ease-simmer)_both]';

type PieceProps = { src: string; className: string; delay: number };

const Piece = ({ src, className, delay }: PieceProps) => (
  <img
    src={src}
    alt=""
    draggable={false}
    className={`absolute h-auto select-none ${STAMP} ${className}`}
    style={{ animationDelay: `${delay}ms` }}
  />
);

export const GroceryDrop = ({ className = '' }: { className?: string }) => (
  <div aria-hidden="true" className={`pointer-events-none absolute aspect-square ${className}`}>
    {/* The grounds: a paprika shard crashing in, a marigold burst where the bag lands. */}
    <span
      className={`absolute left-[30%] top-[-2%] block h-[64%] w-[82%] bg-paprika [clip-path:var(--mk-cut-shard)] [rotate:9deg] [--slide-from:80px] ${SLIDE}`}
    />
    <span
      className={`absolute left-[42%] top-[44%] block aspect-square w-[62%] bg-marigold [clip-path:var(--mk-cut-burst)] [rotate:-9deg] ${STAMP}`}
      style={{ animationDelay: '120ms' }}
    />
    <span
      className={`absolute left-[62%] top-[40%] block h-[6%] w-[44%] bg-cornflower [clip-path:var(--mk-cut-tag)] [rotate:-24deg] [--slide-from:60px] ${SLIDE}`}
      style={{ animationDelay: '220ms' }}
    />
    <span
      className={`absolute left-[64%] top-[92%] block h-[5%] w-[26%] bg-enamel [clip-path:var(--mk-cut-tag)] [rotate:-12deg] ${STAMP}`}
      style={{ animationDelay: '260ms' }}
    />

    {/* The bag itself, tipped over, and what fell out of it — heaviest first. */}
    <Piece src={bag} delay={300} className="left-[50%] top-[50%] w-[46%] [rotate:-26deg]" />
    <Piece src={cabbage} delay={360} className="left-[52%] top-[10%] w-[30%] [rotate:-10deg]" />
    <Piece src={beet} delay={410} className="left-[33%] top-[30%] w-[20%] [rotate:24deg]" />
    <Piece src={potato} delay={450} className="left-[86%] top-[34%] w-[17%] [rotate:-18deg]" />
    <Piece src={carrot} delay={490} className="left-[6%] top-[42%] w-[30%] [rotate:-30deg]" />
    <Piece src={tomato} delay={530} className="left-[17%] top-[12%] w-[18%] [rotate:-14deg]" />
    <Piece src={cucumber} delay={570} className="left-[26%] top-[62%] w-[24%] [rotate:24deg]" />
    <Piece src={garlic} delay={610} className="left-[82%] top-[14%] w-[12%] [rotate:14deg]" />
    <Piece src={dill} delay={650} className="left-[40%] top-[0%] w-[10%] [rotate:-26deg]" />
    <Piece src={cherries} delay={690} className="left-[3%] top-[6%] w-[12%] [rotate:-22deg]" />
    <Piece src={mushroom} delay={730} className="left-[44%] top-[80%] w-[13%] [rotate:10deg]" />

    {/* Crumbs. */}
    <Motif
      name="poppy"
      m1="var(--mk-paper)"
      className={`absolute left-[60%] top-[34%] w-[11%] [rotate:-18deg] ${STAMP}`}
      style={{ animationDelay: '760ms' }}
    />
    <Motif
      name="spark"
      m1="var(--mk-cornflower)"
      className={`absolute left-[14%] top-[84%] w-[8%] [rotate:-30deg] ${STAMP}`}
      style={{ animationDelay: '800ms' }}
    />
    <Motif
      name="leaf"
      m1="var(--mk-garden)"
      m3="var(--mk-plum-900)"
      className={`absolute left-[30%] top-[52%] w-[6%] [rotate:-38deg] ${STAMP}`}
      style={{ animationDelay: '820ms' }}
    />
    <Motif
      name="daisy"
      m1="var(--mk-enamel)"
      m3="var(--mk-paprika)"
      className={`absolute left-[92%] top-[60%] w-[8%] [rotate:14deg] ${STAMP}`}
      style={{ animationDelay: '860ms' }}
    />
    <Motif
      name="spark"
      m1="var(--mk-marigold)"
      className={`absolute left-[76%] top-[0%] w-[7%] [rotate:90deg] ${STAMP}`}
      style={{ animationDelay: '880ms' }}
    />
  </div>
);
