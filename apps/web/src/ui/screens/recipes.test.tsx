import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RecipeIR } from '@kitchen/domain';
import { useSession } from '@/app/store';
import pack from '../../../public/registry/packs/seed-fast-mains.json';
import { App } from '../App';

/** The corrections screen, reached the way the pipeline reaches it: with what it found. */

const recipes = (pack as { recipes: RecipeIR[] }).recipes.slice(0, 2);

beforeEach(() => {
  useSession.getState().reset();
  useSession.setState({
    screen: 'recipes',
    found: {
      intake: { wants: ['stir fry'], pantry: [], cookCount: 2, restrictions: [], notes: [] },
      recipes,
      queries: ['stir fry'],
      corrections: [],
      notes: [],
      portionTarget: 14,
    },
  });
});

describe('what it found', () => {
  it('drops a recipe from its bin button, named for the dish it removes', async () => {
    const user = userEvent.setup();
    render(<App />);
    const [first, second] = recipes as [RecipeIR, RecipeIR];

    expect(screen.getByRole('heading', { name: first.title })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `Remove ${first.title}` }));

    expect(screen.queryByRole('heading', { name: first.title })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: second.title })).toBeInTheDocument();
    expect(useSession.getState().found?.recipes.map((r) => r.id)).toEqual([second.id]);
  });
});
