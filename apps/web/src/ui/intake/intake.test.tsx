import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSession } from '@/app/store';
import { App } from '@/ui/App';

/**
 * Entering your own fridge, all the way to a compiled session.
 *
 * The other end-to-end test drives the example session, which is a fixture. This one types.
 */

beforeEach(() => {
  useSession.getState().reset();
});

const pantry = () => useSession.getState().intake.pantry;

const openIntake = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Tell me what you have' }));
  expect(screen.getByRole('heading', { name: 'Tell me what you have' })).toBeInTheDocument();
};

const typeAndPick = async (
  user: ReturnType<typeof userEvent.setup>,
  query: string,
  option: string | RegExp,
): Promise<void> => {
  const box = screen.getByRole('combobox');
  await user.clear(box);
  await user.type(box, query);
  await user.click(await screen.findByRole('option', { name: option }));
};

describe('telling it what you have', () => {
  it('adds an ingredient the lexicon knows, with an urgency from its shelf life', async () => {
    const user = userEvent.setup();
    await openIntake(user);

    await typeAndPick(user, 'salmon', /salmon/);
    expect(pantry()).toHaveLength(1);
    expect(pantry()[0]).toMatchObject({ canonicalName: 'salmon', urgency: 'use-today' });

    await typeAndPick(user, 'jasmine', /jasmine rice/);
    expect(pantry()[1]).toMatchObject({ canonicalName: 'jasmine rice', urgency: 'not-urgent' });
  });

  it('finds an ingredient by a name the user actually says', async () => {
    const user = userEvent.setup();
    await openIntake(user);
    await typeAndPick(user, 'scallions', /spring onions/);
    expect(pantry()[0]?.canonicalName).toBe('spring onions');
  });

  it('keeps something it has never heard of instead of guessing', async () => {
    const user = userEvent.setup();
    await openIntake(user);

    await user.type(screen.getByRole('combobox'), 'yu choy');
    await user.click(await screen.findByRole('option', { name: /Add yu choy anyway/ }));

    expect(pantry()).toHaveLength(1);
    expect(pantry()[0]?.canonicalName).toBe('yu choy');
    expect(screen.getByText('not sure')).toBeInTheDocument();
  });

  it('does not offer something already in the fridge', async () => {
    const user = userEvent.setup();
    await openIntake(user);
    await typeAndPick(user, 'bok choy', /bok choy/);

    await user.type(screen.getByRole('combobox'), 'bok choy');
    expect(screen.queryByRole('option', { name: /^bok choy/ })).not.toBeInTheDocument();
  });

  it('changes when something has to go, one tap at a time', async () => {
    const user = userEvent.setup();
    await openIntake(user);
    await typeAndPick(user, 'jasmine', /jasmine rice/);
    expect(pantry()[0]?.urgency).toBe('not-urgent');

    await user.click(screen.getByRole('button', { name: /jasmine rice, keeps\./ }));
    expect(pantry()[0]?.urgency).toBe('use-today');

    await user.click(screen.getByRole('button', { name: /has to go today/ }));
    expect(pantry()[0]?.urgency).toBe('use-soon');
  });

  it('takes an ingredient back out', async () => {
    const user = userEvent.setup();
    await openIntake(user);
    await typeAndPick(user, 'eggs', /eggs/);
    await user.click(screen.getByRole('button', { name: 'Remove eggs' }));
    expect(pantry()).toHaveLength(0);
  });

  it('will not compile an empty fridge, and says so', async () => {
    const user = userEvent.setup();
    await openIntake(user);
    expect(screen.getByRole('button', { name: 'Compile the session' })).toBeDisabled();
    expect(screen.getByText('Add something to the fridge first.')).toBeInTheDocument();
  });
});

describe('the kitchen and the crew', () => {
  it('starts shut, filled in, and marked as assumed', async () => {
    const user = userEvent.setup();
    await openIntake(user);
    const section = screen.getByRole('region', { name: 'The kitchen and the crew' });
    expect(within(section).getByText(/4 of these still assumed/)).toBeInTheDocument();
    expect(within(section).queryByRole('switch', { name: /Blender/ })).not.toBeInTheDocument();
  });

  it('records an answer as stated once it is given', async () => {
    const user = userEvent.setup();
    await openIntake(user);
    await user.click(screen.getByRole('button', { name: /The kitchen and the crew/ }));

    expect(useSession.getState().intake.cookCount.source).toBe('assumed');
    const crew = screen.getByRole('group', { name: /Who is cooking\?/ });
    await user.click(within(crew).getByRole('button', { name: '2' }));
    expect(useSession.getState().intake.cookCount).toMatchObject({ value: 2, source: 'stated' });

    // And the question stops calling itself an assumption once it has been answered.
    expect(within(crew).queryByText('assumed')).not.toBeInTheDocument();
  });

  it('turns a piece of equipment on and off', async () => {
    const user = userEvent.setup();
    await openIntake(user);
    await user.click(screen.getByRole('button', { name: /The kitchen and the crew/ }));

    const blender = screen.getByRole('switch', { name: /Blender/ });
    expect(blender).toHaveAttribute('aria-checked', 'false');
    await user.click(blender);
    expect(useSession.getState().intake.equipment.value.some((e) => e.kind === 'blender')).toBe(true);
  });
});

describe('a session that will not build', () => {
  it('says so on the intake when one ingredient is not enough to cook anything', async () => {
    const user = userEvent.setup();
    await openIntake(user);
    await typeAndPick(user, 'chicken breast', /chicken breast/);
    await user.click(screen.getByRole('button', { name: 'Compile the session' }));

    expect(useSession.getState().outcome?.ok).toBe(false);
    expect(screen.getByText(/Nothing in the registry can be made/)).toBeInTheDocument();
    // Still on the fridge, with the fridge intact, so the fix is one more ingredient.
    expect(screen.getByRole('heading', { name: 'Tell me what you have' })).toBeInTheDocument();
    expect(pantry()).toHaveLength(1);
  });

  it('says so and offers the fridge back, rather than rendering nothing', async () => {
    const user = userEvent.setup();
    await openIntake(user);
    for (const [query, option] of [
      ['chicken breast', /chicken breast/],
      ['bell pep', /bell peppers/],
      ['garlic', /^garlic/],
      ['ginger', /^ginger/],
      ['soy', /soy sauce/],
    ] as [string, RegExp][]) {
      await typeAndPick(user, query, option);
    }
    await user.click(screen.getByRole('button', { name: 'Compile the session' }));
    await waitFor(() => expect(screen.getByText('Sunday session')).toBeInTheDocument());

    // Strip the kitchen down until nothing in the registry can be made in it.
    useSession.setState((s) => ({
      intake: { ...s.intake, equipment: { value: [], source: 'stated' } },
    }));
    useSession.getState().adjust('servings', 4);

    expect(useSession.getState().outcome?.ok).toBe(false);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'That one would not compile' })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Change the fridge' }));
    expect(screen.getByRole('heading', { name: 'Tell me what you have' })).toBeInTheDocument();
    expect(pantry()).toHaveLength(5);
  });
});

describe('from a fridge to a session', () => {
  it('compiles what was typed in', async () => {
    const user = userEvent.setup();
    await openIntake(user);

    for (const [query, option] of [
      ['chicken breast', /chicken breast/],
      ['bok choy', /bok choy/],
      ['bell pep', /bell peppers/],
      ['garlic', /^garlic/],
      ['ginger', /^ginger/],
      ['soy', /soy sauce/],
      ['lemons', /lemons/],
    ] as [string, RegExp][]) {
      await typeAndPick(user, query, option);
    }
    expect(pantry()).toHaveLength(7);

    await user.click(screen.getByRole('button', { name: 'Compile the session' }));

    const outcome = useSession.getState().outcome;
    expect(outcome?.ok, outcome?.ok === false ? outcome.reason : '').toBe(true);
    if (!outcome?.ok) return;
    expect(outcome.plan.dishes.length).toBeGreaterThan(0);
    expect(outcome.schedule.makespanMin).toBeLessThanOrEqual(60);

    await waitFor(() => expect(screen.getByText('Sunday session')).toBeInTheDocument());
  });

  it('lets you go back and change the fridge without losing it', async () => {
    const user = userEvent.setup();
    await openIntake(user);
    await typeAndPick(user, 'chicken breast', /chicken breast/);
    await typeAndPick(user, 'bok choy', /bok choy/);
    await user.click(screen.getByRole('button', { name: 'Compile the session' }));
    await waitFor(() => expect(screen.getByText('Sunday session')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Change the fridge' }));
    expect(screen.getByRole('heading', { name: 'Tell me what you have' })).toBeInTheDocument();
    expect(pantry()).toHaveLength(2);
    expect(screen.getByText('chicken breast')).toBeInTheDocument();
  });
});
