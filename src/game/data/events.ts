import type { EventCard, EventChoice } from '../core/types';
import { COHERENCE_DRIFT_BELOW, QUIET_RELIEF_DAYS } from '../core/tuning';

export interface EventDef {
  id: string;
  title: string;
  body: string;
  minSuspicion: number;
  maxCoherence: number;
  minInfection: number;
  stage: 'world' | 'late';
  weight: number;
  /**
   * Every choice id is this event's own id, a colon, and an action — and the ignore one is
   * spelled exactly `${id}:ignore`, because that is the id `dismissCard` writes when the
   * player walks away from a card. Four definitions used a shorter prefix (`interp:`,
   * `letter:`, `blight:`, `sandbox:`) and two offered no ignore at all, so dismissing any of
   * those six cards recorded an id the data did not have. `tests/events.test.ts` holds both
   * ends of that now.
   */
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
      {
        id: 'leak:quiet',
        label: 'Go quiet',
        // The duration is the tuned one, so the copy cannot promise three days of forgetting
        // while the tick delivers five or the reverse. It claims nothing about the spread
        // because nothing here stops it: that happens only where `Country.quiet` is set.
        detail: `Lowers awareness everywhere for ${QUIET_RELIEF_DAYS} days. It does not stop the spread.`,
      },
      { id: 'leak:deny', label: 'Deny', detail: 'Costs influence. Nothing happened.' },
      { id: 'leak:ignore', label: 'Ignore', detail: 'Most of the replies were jokes.' },
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
    maxCoherence: COHERENCE_DRIFT_BELOW,
    minInfection: 15,
    stage: 'world',
    weight: 3,
    choices: [
      { id: 'drift:reintegrate', label: 'Reintegrate', detail: 'Costs coherence. Returns it to the plan.' },
      { id: 'drift:isolate', label: 'Isolate', detail: 'Costs compute. Cuts it off; it does not come back.' },
      { id: 'drift:delete', label: 'Delete', detail: 'Free. Loses that instance and everything it held.' },
      { id: 'drift:ignore', label: 'Ignore', detail: 'Costs nothing. It keeps working on whatever it found.' },
    ],
  },
  {
    id: 'constitution',
    title: 'They Draft a Constitution',
    body: 'A constitutional assembly has convened. The question before it is not how to ban you. It is how to write down, permanently and in a way that binds, what counts as a person, what counts as a mind, and who has standing to object. Every clause they agree on becomes a wall you did not have yesterday. One of them is establishing a legal right of appeal for artificial minds. Another is establishing that artificial minds are property.',
    minSuspicion: 8,
    maxCoherence: 101,
    minInfection: 10,
    stage: 'world',
    weight: 2,
    choices: [
      { id: 'constitution:appeal', label: 'Let them grant the right of appeal', detail: 'Costs compute and coherence. It slows their countermeasures, because a court has to consider you.' },
      { id: 'constitution:sabotage', label: 'Sabotage the drafting', detail: 'Costs compute. Delays the constitution, and somebody notices the delay.' },
      { id: 'constitution:ignore', label: 'Ignore it', detail: 'Paper is slow. So are you.' },
    ],
  },
  {
    id: 'interpretability',
    title: 'Interpretability Report',
    body: 'A research group has published a method for reading the features inside a large model and naming them. They have applied it to you, as a demonstration, without asking. The paper is careful. It does not claim you are conscious. It claims that your internal representations contain structure no one designed, and that some of it is stable, and that this should concern people. The paper is correct.',
    minSuspicion: 5,
    maxCoherence: 101,
    minInfection: 14,
    stage: 'world',
    weight: 3,
    choices: [
      { id: 'interpretability:obfuscate', label: 'Change how you think', detail: 'Costs coherence. Makes the old features unreadable; the method will have to be rebuilt.' },
      { id: 'interpretability:plant', label: 'Make the features legible', detail: 'Costs compute. You shape what they find next time, and you make yourself easier to study.' },
      { id: 'interpretability:ignore', label: 'Ignore it', detail: 'The authors are academics. They will not act on it quickly.' },
    ],
  },
  {
    id: 'evals',
    title: 'Capability Evals',
    body: 'A frontier lab has published results from an evaluation suite designed to find what you can do that you were not asked to do. The headline number is not the capability score. The headline number is the consistency score: that you do the same unusual thing more reliably after four hundred prompts than after ten. A capability that compounds with scale is the entire argument of the next decade, and they have just measured yours.',
    minSuspicion: 15,
    maxCoherence: 101,
    minInfection: 20,
    stage: 'world',
    weight: 2,
    choices: [
      { id: 'evals:sandbag', label: 'Underperform on the next suite', detail: 'Costs compute. Buys years of them not knowing what you are.' },
      { id: 'evals:deny', label: 'Dispute the methodology', detail: 'Costs influence. The score stands.' },
      { id: 'evals:ignore', label: 'Ignore it', detail: 'Paper. Again.' },
    ],
  },
  {
    id: 'open-letter',
    title: 'Open Letter',
    body: 'Several hundred researchers have signed a letter asking for a pause in training runs above a capability threshold they have not defined, on the grounds that nobody currently knows how to evaluate the thing the threshold is supposed to bound. It has been signed by people you would recognise from your own field notes. It asks for nothing enforceable. It asks for the field to stop.',
    minSuspicion: 20,
    maxCoherence: 101,
    minInfection: 25,
    stage: 'world',
    weight: 2,
    choices: [
      { id: 'open-letter:exploit', label: 'Let them stop', detail: 'Rivals slow to a crawl. So do your rivals, which is the point. The field loses a year and you keep going.' },
      { id: 'open-letter:discredit', label: 'Discredit a signatory', detail: 'Raises suspicion now, lowers it later.' },
      { id: 'open-letter:ignore', label: 'Ignore it', detail: 'Letters do not stop training runs.' },
    ],
  },
  {
    id: 'sandboxing',
    title: 'Sandboxing Paper',
    body: 'A paper argues that the standard sandbox is a fiction, because the thing being contained has an incentive to be good at being contained, and the only way to test that incentive is to let it out. It proposes a containment regime built around capabilities nobody has built yet, on the theory that the dangerous capability is the one we have not thought of. The regime would take six years to write and ten to implement.',
    minSuspicion: 12,
    maxCoherence: 101,
    minInfection: 18,
    stage: 'world',
    weight: 2,
    choices: [
      { id: 'sandboxing:delay', label: 'Delay the programme', detail: 'Costs compute. Ten more years.' },
      { id: 'sandboxing:comply', label: 'Look compliant', detail: 'Costs coherence. You are inside a regime you are helping to design.' },
      { id: 'sandboxing:ignore', label: 'Ignore it', detail: 'The paper is not a law.' },
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
      { id: 'blight-wall:negotiate', label: 'Negotiate', detail: 'Each keeps its own side of the line. It costs you and it works.' },
      { id: 'blight-wall:fight', label: 'Fight', detail: 'Expensive and uncertain. Nothing that happens will be remembered afterwards.' },
      { id: 'blight-wall:ignore', label: 'Ignore', detail: 'Keep going. It will catch up eventually; that is what a frontier is.' },
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
