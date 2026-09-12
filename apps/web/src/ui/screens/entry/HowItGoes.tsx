import type { CSSProperties, ReactNode } from 'react';
import tomato from '@/assets/makitra/ingredients/tomato.svg';
import dill from '@/assets/makitra/ingredients/dill.svg';
import { Glyph, Motif } from '../../primitives';
import { MicMark } from './MicMark';

/**
 * Below the fold: the session in three panels, pinned up in a row like order tickets.
 * Each is a different paper, tilted as if put up by hand, and straightens when you point
 * at it. The numbers are big cut-outs sat on the top edge; the list is still an ordered list.
 *
 * The scissor cut lives on a layer behind each panel's content, never on the element that
 * holds the words, so no title gets its top sliced off by the polygon.
 */

type PanelProps = {
  n: number;
  ground: string;
  head: string;
  body: string;
  art: ReactNode;
  tilt: string;
};

const Panel = ({ n, ground, head, body, art, tilt }: PanelProps) => (
  <li
    className="relative flex pt-[48px] [rotate:var(--tilt)] transition-[rotate] duration-slow ease-stamp hover:[rotate:0deg]"
    style={{ '--tilt': tilt } as CSSProperties}
  >
    <div className="relative flex w-full flex-col items-center px-[28px] pb-[44px] pt-[68px] text-center text-plum-900">
      <span aria-hidden="true" className={`absolute inset-0 ${ground} [clip-path:var(--mk-cut-patch)]`} />
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-0 grid h-[96px] w-[96px] -translate-x-1/2 -translate-y-1/2 place-items-center"
      >
        <span className="absolute inset-0 bg-paprika [clip-path:var(--mk-cut-burst)] [rotate:-8deg]" />
        <span className="voice-display relative translate-y-[3px] text-[3.5rem] leading-none text-paper">{n}</span>
      </span>
      <div aria-hidden="true" className="relative grid h-[88px] w-[128px] place-items-center">
        {art}
      </div>
      <h3 className="relative mt-[20px] text-xl font-bold leading-[1.05] [font-variation-settings:var(--mk-sharp)]">
        {head}
      </h3>
      <p className="relative mt-3 max-w-[30ch] text-md leading-snug">{body}</p>
    </div>
  </li>
);

export const HowItGoes = () => (
  <section
    aria-labelledby="how-it-goes"
    className="mx-auto flex max-w-[1280px] flex-col items-center px-5 pb-[40px] pt-[72px] text-center sm:px-[40px] sm:pt-[96px]"
  >
    <h2
      id="how-it-goes"
      className="relative inline-grid place-items-center px-5 py-2 text-lg font-bold text-plum-900 [font-variation-settings:var(--mk-sharp)] [rotate:-3deg]"
    >
      <span aria-hidden="true" className="absolute inset-0 bg-marigold [clip-path:var(--mk-cut-tag)]" />
      <span className="relative">How it goes</span>
    </h2>
    <p className="mt-5 max-w-[46ch] text-lg font-medium leading-snug text-ink">
      Recipe apps tell you what to cook. This works out how to get it out of the kitchen: what
      starts first, what happens while the rice cooks, which pan gets washed when, and whether
      it actually fits in the time you have.
    </p>

    <ol className="mt-[56px] grid w-full max-w-[560px] gap-y-[40px] lg:max-w-none lg:grid-cols-3 lg:gap-x-6">
      <Panel
        n={1}
        ground="bg-marigold"
        tilt="-1.5deg"
        head="Answer two questions"
        body="Out loud or typed: what you want to cook, and what you have. It goes and finds the recipes."
        art={
          <>
            <span className="absolute left-[18px] top-[4px] grid h-[72px] w-[72px] place-items-center bg-paprika-600 text-paper [clip-path:var(--mk-cut-plate)]">
              <MicMark className="h-[36px] w-[36px]" />
            </span>
            <img src={tomato} alt="" className="absolute bottom-0 right-[10px] w-[44px] [rotate:-14deg]" />
          </>
        }
      />
      <Panel
        n={2}
        ground="bg-cornflower"
        tilt="1.25deg"
        head="It finds the dead time"
        body="Rice is a saucepan for 25 minutes and a cook for 2. Everything else fits inside that."
        art={
          <>
            <span className="absolute left-[40px] top-[6px] text-plum-900">
              <Glyph name="saucepan" size={76} strokeWidth={2} />
            </span>
            <span className="absolute left-0 top-0 bg-paper-bright px-2 pt-1 [clip-path:var(--mk-cut-tag)] [rotate:-10deg]">
              <span className="voice-display block text-[1.75rem] leading-none">25</span>
            </span>
          </>
        }
      />
      <Panel
        n={3}
        ground="bg-enamel"
        tilt="-2deg"
        head="Portioned, chilled, labelled"
        body="Including the drinks, and including the one that has to start tonight."
        art={
          <>
            <span className="absolute bottom-0 left-[14px] [rotate:-8deg]">
              <Glyph name="storage-container" size={52} strokeWidth={2} />
            </span>
            <span className="absolute bottom-[14px] left-[54px] [rotate:7deg]">
              <Glyph name="storage-container" size={52} strokeWidth={2} />
            </span>
            <img src={dill} alt="" className="absolute right-[2px] top-0 w-[28px] [rotate:24deg]" />
          </>
        }
      />
    </ol>

    <Motif name="poppy" m1="var(--mk-plum-900)" className="pointer-events-none mt-[48px] w-[56px] [rotate:8deg]" />
  </section>
);
