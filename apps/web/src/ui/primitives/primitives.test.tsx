import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, Card, Chip, CompileCurtain, COMPILE_STAGES, Field, Glyph, ProgressRail, Toggle } from './index';

describe('Button', () => {
  it('meets the 44px hit target at the default size and 56px in cooking mode', () => {
    const { rerender } = render(<Button>Compile the session</Button>);
    expect(screen.getByRole('button').className).toContain('min-h-[44px]');
    rerender(<Button size="lg">Done</Button>);
    expect(screen.getByRole('button').className).toContain('min-h-[56px]');
  });

  it('has an accessible name from its content', () => {
    render(<Button icon="frying-pan">Start the rice</Button>);
    expect(screen.getByRole('button', { name: 'Start the rice' })).toBeInTheDocument();
  });

  it('defaults to type=button so it never submits a form by accident', () => {
    render(<Button>Skip</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('Chip', () => {
  it('says when the compiler assumed something rather than hearing it', () => {
    render(<Chip icon="pantry" assumed>Sesame oil</Chip>);
    expect(screen.getByText('assumed')).toBeInTheDocument();
  });

  it('flags an ingredient that has to go today', () => {
    render(<Chip icon="produce" urgent>Bok choy</Chip>);
    expect(screen.getByText('today')).toBeInTheDocument();
  });

  it('keeps an unrecognised term instead of dropping it', () => {
    render(<Chip unrecognised>yu choy</Chip>);
    expect(screen.getByText('yu choy')).toBeInTheDocument();
    expect(screen.getByText('not sure')).toBeInTheDocument();
  });

  it('gives the remove control a name that says what it removes', async () => {
    const onRemove = vi.fn();
    render(<Chip onRemove={onRemove}>Bok choy</Chip>);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Bok choy' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});

describe('Card', () => {
  it('uses a non-uniform radius token rather than a plain rounded rect', () => {
    render(<Card>Chicken and bok choy</Card>);
    expect(screen.getByTestId('card').className).toMatch(/rounded-(sm|md|lg)/);
  });
});

describe('Glyph', () => {
  it('is hidden from assistive technology when it is decorative', () => {
    const { container } = render(<Glyph name="saucepan" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('becomes an image with a name when it carries the meaning', () => {
    render(<Glyph name="saucepan" title="Saucepan" />);
    expect(screen.getByRole('img', { name: 'Saucepan' })).toBeInTheDocument();
  });
});

describe('Field and Toggle', () => {
  it('associates the label and the hint with the input', () => {
    render(<Field label="Time budget" hint="We will fit the session inside this." suffix="min" />);
    const input = screen.getByLabelText('Time budget');
    expect(input).toHaveAccessibleDescription('We will fit the session inside this.');
  });

  it('exposes the toggle as a switch and reports changes', async () => {
    const onChange = vi.fn();
    render(<Toggle label="Low-energy mode" checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch', { name: /Low-energy mode/ }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('ProgressRail', () => {
  it('reports its value to assistive technology', () => {
    render(<ProgressRail value={54} max={60} label="Session length" />);
    const bar = screen.getByRole('progressbar', { name: 'Session length' });
    expect(bar).toHaveAttribute('aria-valuenow', '54');
    expect(bar).toHaveAttribute('aria-valuemax', '60');
  });
});

describe('CompileCurtain', () => {
  const setMotion = (reduce: boolean) => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: reduce && q.includes('reduce'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  };

  it('speaks in kitchen language with no identifiers leaking through', () => {
    setMotion(true);
    render(<CompileCurtain active />);
    for (const stage of COMPILE_STAGES) {
      expect(screen.getByText(stage)).toBeInTheDocument();
      expect(stage).toMatch(/^[a-z][a-z ]+$/);
    }
  });

  it('under reduced motion lands on the final state and still reports success', () => {
    setMotion(true);
    const onDone = vi.fn();
    render(<CompileCurtain active onDone={onDone} />);
    expect(onDone).toHaveBeenCalledOnce();
    expect(screen.getByText('compilation successful')).toBeInTheDocument();
    // The last stage is fully opaque, i.e. the sequence has already landed.
    expect(screen.getByText('compilation successful').className).toContain('opacity-100');
  });

  it('advances one stage at a time when motion is allowed', async () => {
    setMotion(false);
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<CompileCurtain active onDone={onDone} stageMs={100} />);
    expect(screen.getByText('compilation successful').className).toContain('opacity-35');
    expect(onDone).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100 * COMPILE_STAGES.length);
    expect(onDone).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('renders nothing when it is not compiling', () => {
    setMotion(true);
    const { container } = render(<CompileCurtain active={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
