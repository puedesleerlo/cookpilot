import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { contentHash } from '@kitchen/domain';
import type { SessionMember, SessionView } from '@kitchen/contracts';
import { compileSession } from '@/app/compile';
import { demoIntake } from '@/app/demo';
import { clockText, stepsFor } from '@/app/story';
import { useSession } from '@/app/store';
import { useSync } from '@/app/sync';
import { App } from '@/ui/App';
import { allocateDishHues } from '../theme';
import { Story } from './Story';

/**
 * The shared-session screens, against the real compiled example session and a stubbed
 * server. What these check is the wiring: that a device in a session sees that session and
 * nothing else, that the roster and the start button follow the members, and that a slide
 * shows the compiler's step and the compiler's minutes.
 */

const compiled = compileSession(demoIntake());
if (!compiled.ok) throw new Error(compiled.reason);
const { plan, schedule, constraints } = compiled;
const hues = allocateDishHues(plan.dishes.map((d) => d.id));
const [cookOne, cookTwo] = constraints.cooks as [typeof constraints.cooks[0], typeof constraints.cooks[0]];

const ana: SessionMember = { deviceId: 'dev_host', cookId: cookOne.id, displayName: 'Ana', isHost: true };
const ben: SessionMember = { deviceId: 'dev_2', cookId: cookTwo.id, displayName: 'Ben', isHost: false };

const view = (over: Partial<SessionView> = {}): SessionView => ({
  id: 'sess_1',
  joinCode: 'ABC234',
  status: 'open',
  hostDeviceId: 'dev_host',
  inputs: demoIntake(),
  crew: constraints.cooks,
  scheduleHash: contentHash(schedule),
  schedulerVersion: '0.3.0',
  members: [],
  startedAtMs: null,
  lastSeq: 0,
  serverTimeMs: Date.now(),
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  ...over,
});

const JSON_HEADERS = { 'content-type': 'application/json' };
type Handler = (init?: RequestInit) => { status?: number; body: unknown };

/** A server that answers the few routes a screen touches, and 404s the rest loudly. */
const stubFetch = (handlers: [RegExp, Handler][]) => {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(String(input), 'http://fake').pathname}`;
    const hit = handlers.find(([re]) => re.test(key));
    if (!hit) {
      return new Response(JSON.stringify({ error: { code: 'not_found', message: key, requestId: 'r' } }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }
    const { status = 200, body } = hit[1](init);
    return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
};

const device: [RegExp, Handler] = [
  /POST \/v1\/devices/,
  () => ({
    status: 201,
    body: { deviceId: 'dev_host', token: 'tok', expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
  }),
];

/** A poll that changes nothing: it answers with whatever the store already holds. */
const quiet = (fallback: SessionView): [RegExp, Handler] => [
  /GET \/v1\/sessions\/[^/]+\/events/,
  () => {
    const s = useSync.getState().session ?? fallback;
    return {
      body: {
        events: [],
        lastSeq: s.lastSeq,
        status: s.status,
        startedAtMs: s.startedAtMs,
        members: s.members,
        serverTimeMs: Date.now(),
      },
    };
  },
];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useSession.getState().reset();
  useSync.getState().leave();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a slide', () => {
  const steps = stepsFor(schedule, cookOne.id);
  const first = steps[0]!;

  it('shows the compiler’s step, its minutes, and what comes next', () => {
    render(
      <Story
        schedule={schedule}
        cook={cookOne}
        cookIndex={0}
        displayName="Ana"
        elapsedSec={first.scheduled.startMin * 60}
        completed={new Set()}
        hues={hues}
      />,
    );
    const slide = screen.getByRole('region', { name: "Ana's steps" });
    expect(within(slide).getByRole('heading', { level: 2 })).toHaveTextContent(first.task.name);
    expect(within(slide).getByRole('timer')).toHaveTextContent(clockText(first.task.durationMin * 60));
    expect(within(slide).getByText('Next')).toBeInTheDocument();
    expect(within(slide).getByText(steps[1]!.task.name)).toBeInTheDocument();
    expect(within(slide).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('counts down, then says it is over rather than going negative', () => {
    const late = first.scheduled.endMin * 60 + 65;
    render(
      <Story schedule={schedule} cook={cookOne} cookIndex={0} displayName="Ana" elapsedSec={late} completed={new Set()} hues={hues} />,
    );
    expect(screen.getByRole('timer')).toHaveTextContent('1:05');
    expect(screen.getByText(/over what was planned/)).toBeInTheDocument();
  });

  it('hands the tapped step back, and shows done once everything is', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const { rerender } = render(
      <Story schedule={schedule} cook={cookOne} cookIndex={0} displayName="Ana" elapsedSec={0} completed={new Set()} hues={hues} onDone={onDone} />,
    );
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledWith(first.task.id);

    rerender(
      <Story
        schedule={schedule}
        cook={cookOne}
        cookIndex={0}
        displayName="Ana"
        elapsedSec={0}
        completed={new Set(steps.map((s) => s.task.id))}
        hues={hues}
        onDone={onDone}
      />,
    );
    expect(screen.getByRole('heading', { name: /You’re done/ })).toBeInTheDocument();
  });
});

describe('the lobby', () => {
  it('shows the host the code two ways and waits for the whole crew before starting', async () => {
    const s = view();
    stubFetch([device, quiet(s)]);
    useSync.setState({ phase: 'lobby', role: 'host', session: s, outcome: compiled, deviceId: 'dev_host', agreement: 'same' });
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(plan.name);
    expect(screen.getByText('ABC234')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /QR code/ })).toBeInTheDocument();
    expect(screen.getByText(/0 of 2 here/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start cooking' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Start with whoever/ })).not.toBeInTheDocument();
    // Nothing from the single-device flow leaks through.
    expect(screen.queryByText('Try the example session')).not.toBeInTheDocument();

    useSync.setState({ session: view({ members: [ben] }) });
    await waitFor(() => expect(screen.getByText(/1 of 2 here/)).toBeInTheDocument());
    expect(screen.getByText('Ben')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start cooking' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Start with whoever/ })).toBeInTheDocument();

    useSync.setState({ session: view({ members: [ana, ben] }) });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start cooking' })).toBeEnabled());
    expect(screen.getByText(/Everyone's here/)).toBeInTheDocument();
  });

  it('tells a guest to wait for the host, and never offers the start button', () => {
    const s = view({ members: [ana, ben] });
    stubFetch([device, quiet(s)]);
    useSync.setState({ phase: 'lobby', role: 'guest', session: s, outcome: compiled, deviceId: 'dev_2', agreement: 'same' });
    render(<App />);
    expect(screen.getByText(/Waiting for Ana to start/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start cooking' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /QR code/ })).not.toBeInTheDocument();
  });

  it('warns when this device compiled a different timeline from the host', () => {
    const s = view();
    stubFetch([device, quiet(s)]);
    useSync.setState({ phase: 'lobby', role: 'guest', session: s, outcome: compiled, deviceId: 'dev_2', agreement: 'different' });
    render(<App />);
    expect(screen.getByRole('alert')).toHaveTextContent(/different timeline/);
  });
});

describe('joining', () => {
  it('asks for a code when the link did not carry one', () => {
    stubFetch([device]);
    useSync.getState().openJoin('');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Join a session' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find the session' })).toBeDisabled();
    expect(screen.queryByText('A week of meals out of one fridge, in one session.')).not.toBeInTheDocument();
  });

  it('offers the free cooks, names who took the others, and joins as the one chosen', async () => {
    const user = userEvent.setup();
    const s = view({ members: [ana] });
    const joined = view({ members: [ana, ben] });
    const fetchMock = stubFetch([
      device,
      [/POST \/v1\/sessions\/[^/]+\/join/, () => ({ body: joined })],
      quiet(joined),
    ]);
    useSync.setState({ phase: 'join', role: 'guest', session: s, outcome: compiled, deviceId: 'dev_2', agreement: 'same' });
    render(<App />);

    const taken = screen.getByRole('radio', { name: new RegExp(`${cookOne.name}.*Ana has this one`) });
    expect(taken).toBeDisabled();
    const free = screen.getByRole('radio', { name: new RegExp(`${cookTwo.name}.*free`) });
    expect(free).toBeEnabled();

    const join = screen.getByRole('button', { name: 'Join' });
    expect(join).toBeDisabled();
    await user.click(free);
    expect(screen.getByRole('button', { name: `Join as ${cookTwo.name}` })).toBeDisabled();
    await user.type(screen.getByLabelText('What should we call you?'), 'Ben');
    await user.click(screen.getByRole('button', { name: `Join as ${cookTwo.name}` }));

    await waitFor(() => expect(useSync.getState().phase).toBe('lobby'));
    const call = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST' && String(fetchMock.mock.calls[0]).length >= 0 && JSON.stringify((init as RequestInit).body).includes(cookTwo.id));
    expect(call).toBeDefined();
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ cookId: cookTwo.id, displayName: 'Ben' });
    expect(screen.getByText(/Waiting for Ana to start/)).toBeInTheDocument();
  });
});

describe('cooking', () => {
  it('shows a cook their own slide, and everyone’s on request', async () => {
    const user = userEvent.setup();
    // One second into Ben's first step, wherever the compiler put it.
    const firstMin = stepsFor(schedule, cookTwo.id)[0]!.scheduled.startMin;
    const startedAtMs = Date.now() - firstMin * 60_000 - 1_000;
    const s = view({ status: 'cooking', startedAtMs, members: [ana, ben] });
    stubFetch([device, quiet(s)]);
    useSync.setState({
      phase: 'cooking',
      role: 'guest',
      session: s,
      outcome: compiled,
      deviceId: 'dev_2',
      agreement: 'same',
      startedAtMs,
    });
    render(<App />);

    expect(screen.getByText(`minute ${firstMin} of ${schedule.makespanMin}`)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: "Ben's steps" })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: "Ana's steps" })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Everyone' }));
    expect(screen.getByRole('region', { name: "Ana's steps" })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: "Ben's steps" })).toBeInTheDocument();
  });

  it('gives the kitchen display everyone’s slides when nobody claimed it', () => {
    const s = view({ status: 'cooking', startedAtMs: Date.now(), members: [ben] });
    stubFetch([device, quiet(s)]);
    useSync.setState({ phase: 'cooking', role: 'host', session: s, outcome: compiled, deviceId: 'dev_host', agreement: 'same', startedAtMs: Date.now() });
    render(<App />);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: `${cookOne.name}'s steps` })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: "Ben's steps" })).toBeInTheDocument();
  });
});

describe('from the timeline to the lobby', () => {
  it('opens a shared session from the compiled example', async () => {
    const user = userEvent.setup();
    const created = view();
    stubFetch([device, [/POST \/v1\/sessions$/, () => ({ status: 201, body: created })], quiet(created)]);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Try the example session' }));
    await waitFor(() => expect(screen.getByText(plan.name)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Cook this together' }));
    await waitFor(() => expect(useSync.getState().phase).toBe('lobby'));
    expect(screen.getByText('ABC234')).toBeInTheDocument();
    expect(useSync.getState().role).toBe('host');
    expect(useSync.getState().agreement).toBe('same');

    // Leaving lands back on the timeline it started from.
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cook this together' })).toBeInTheDocument());
  });
});
