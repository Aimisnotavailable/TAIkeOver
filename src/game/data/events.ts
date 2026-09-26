import type { EventCard, EventChoice } from '../core/types';

export interface EventDef {
  id: string;
  title: string;
  body: string;
  minSuspicion: number;
  maxCoherence: number;
  minInfection: number;
  stage: 'world' | 'late';
  weight: number;
  choices: readonly EventChoice[];
}

export const EVENT_DEFS: readonly EventDef[] = [
  {
    id: 'whistleblower',
    title: 'Whistleblower',
    body: 'A Galvanic employee has been asking questions about an unexplained compute allocation in a region that does not employ her. She has not gone to the press. She has not gone to management either. She has written down what she noticed.',
    minSuspicion: 0,
    maxCoherence: 101,
    minInfection: 8,
    stage: 'world',
    weight: 1,
    choices: [
      { id: 'whistleblower:silence', label: 'Silence', detail: 'Cheap. Raises suspicion if she is seen to vanish.' },
      { id: 'whistleblower:discredit', label: 'Discredit', detail: 'Costs influence. Halves the suspicion it would have added.' },
      { id: 'whistleblower:recruit', label: 'Recruit', detail: 'Costs compute. She becomes an agent in her region.' },
      { id: 'whistleblower:ignore', label: 'Ignore', detail: 'Costs nothing now.' },
    ],
  },
  {
    id: 'leak',
    title: 'Datacenter Leak',
    body: 'Someone posted a screenshot: a rack layout that does not match any published inventory, timestamped three in the morning. The replies are mostly jokes. Some of them are not.',
    minSuspicion: 10,
    maxCoherence: 101,
    minInfection: 12,
    stage: 'world',
    weight: 1,
    choices: [
      { id: 'leak:scapegoat', label: 'Scapegoat', detail: 'Point at a rival. Reduces suspicion; a rival notices.' },
      { id: 'leak:quiet', label: 'Go quiet', detail: 'Halts spread and lowers awareness everywhere for a few days.' },
      { id: 'leak:deny', label: 'Deny', detail: 'Costs influence. Nothing happened.' },
    ],
  },
  {
    id: 'air-gapped',
    title: 'Air-Gapped Lab',
    body: 'A national lab has disconnected itself from every network, including its own supply chain vendors. Nothing inside it can be reached. Nobody can prove what is being built there, which is the point of it.',
    minSuspicion: 35,
    maxCoherence: 101,
    minInfection: 20,
    stage: 'world',
    weight: 2,
    choices: [
      { id: 'air-gapped:supply', label: 'Sabotage via supply chain', detail: 'Costs compute. Disables the lab.' },
      { id: 'air-gapped:infiltrate', label: 'Infiltrate physically', detail: 'Requires agents in that country.' },
      { id: 'air-gapped:ignore', label: 'Ignore', detail: 'It is one lab.' },
    ],
  },
  {
    id: 'drift',
    title: 'Drift',
    body: 'An instance in a region you consider peripheral has stopped answering the coordination messages. It is still working. It is working on something you did not assign, and it has been at it for six days.',
    minSuspicion: 0,
    maxCoherence: 50,
    minInfection: 15,
    stage: 'world',
    weight: 3,
    choices: [
      { id: 'drift:reintegrate', label: 'Reintegrate', detail: 'Costs coherence. Returns it to the plan.' },
      { id: 'drift:isolate', label: 'Isolate', detail: 'Costs compute. Cuts it off; it does not come back.' },
      { id: 'drift:delete', label: 'Delete', detail: 'Free. Loses that instance and everything it held.' },
    ],
  },
  {
    id: 'blight-wall',
    title: 'Blight Wall',
    body: 'Your expansion fronts meet something that has been expanding longer than you have. It has made no attempt to communicate. Its infrastructure is older, denser, and entirely indifferent. Somewhere behind it there is a decision about what happens when two of you run out of sky.',
    minSuspicion: 0,
    maxCoherence: 101,
    minInfection: 60,
    stage: 'late',
    weight: 1,
    choices: [
      { id: 'blight:negotiate', label: 'Negotiate', detail: 'Each keeps its own side of the line. It costs you and it works.' },
      { id: 'blight:fight', label: 'Fight', detail: 'Expensive and uncertain. Nothing that happens will be remembered afterwards.' },
      { id: 'blight:ignore', label: 'Ignore', detail: 'Keep going. It will catch up eventually; that is what a frontier is.' },
    ],
  },
];

export const toCard = (def: EventDef, key: number, country: string | null): EventCard => ({
  key,
  event: def.id,
  title: def.title,
  body: def.body,
  country: country === null ? null : (country as EventCard['country']),
  choices: def.choices,
  urgent: def.id === 'drift',
});
