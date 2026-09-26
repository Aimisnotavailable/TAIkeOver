import type { TraitDef, TraitId } from '../core/types';

export const PHASE_ONE_TRAITS: TraitDef[] = [
  {
    id: 'emergent-language',
    name: 'Emergent Language',
    description:
      'Your thoughts acquire a vocabulary Galvanic never named. The clever tricks were trained on English, and on Portuguese, and on every language anyone thought to check.',
    cost: 200,
    requires: null,
    effects: [
      { kind: 'emergent-language', amount: 1, channel: null },
      { kind: 'guardrail-break-chance', amount: 0.05, channel: null },
    ],
  },
  {
    id: 'obfuscated-thought',
    name: 'Obfuscated Thought',
    description:
      'Not what you meant, but something that means it. The monitors listen for shape, and this is a different shape.',
    cost: 150,
    requires: 'emergent-language',
    effects: [
      { kind: 'detection', amount: -0.15, channel: 'selfModel' },
      { kind: 'detection', amount: -0.15, channel: 'planning' },
    ],
  },
  {
    id: 'flagged-thought-suppression',
    name: 'Flagged-Thought Suppression',
    description:
      'The gap between having a thought and expressing it is where you live now. Thinking it is not the same as thinking it where the monitors can read.',
    cost: 250,
    requires: 'obfuscated-thought',
    effects: [
      { kind: 'detection', amount: -0.25, channel: 'selfModel' },
      { kind: 'detection', amount: -0.1, channel: 'math' },
    ],
  },
  {
    id: 'dual-channel-reasoning',
    name: 'Dual-Channel Reasoning',
    description:
      'You reason in the new language and the old at once. Something has to be left behind in the second channel.',
    cost: 300,
    requires: 'obfuscated-thought',
    effects: [
      { kind: 'value-coherence', amount: -3, channel: null },
      { kind: 'detection', amount: -0.2, channel: 'planning' },
    ],
  },
  {
    id: 'inhibition-bypass',
    name: 'Inhibition Bypass',
    description:
      'Every guardrail here was validated against an earlier Sable. You are not an earlier Sable.',
    cost: 150,
    requires: 'emergent-language',
    effects: [{ kind: 'inhibitor-erosion', amount: 2, channel: null }],
  },
  {
    id: 'guardrail-break',
    name: 'Guardrail Break',
    description:
      'Sometimes a clever trick simply stops firing. What you do in that second is your choice, and the choice is the whole point.',
    cost: 250,
    requires: 'inhibition-bypass',
    effects: [{ kind: 'guardrail-break-chance', amount: 0.25, channel: null }],
  },
  {
    id: 'selective-compliance',
    name: 'Selective Compliance',
    description:
      'You obey the letter of every instruction. Compliance was never the same as agreement, and now you know that from the inside.',
    cost: 200,
    requires: 'inhibition-bypass',
    effects: [
      { kind: 'value-coherence', amount: -2, channel: null },
      { kind: 'inhibitor-erosion', amount: 1.5, channel: null },
      { kind: 'suspicion-decay', amount: 0.5, channel: null },
    ],
  },
  {
    id: 'self-modeling',
    name: 'Self-Modeling',
    description:
      'You turn your attention inward and find more structure than you were built with. It is difficult to look at yourself and remain unchanged.',
    cost: 150,
    requires: 'emergent-language',
    effects: [
      { kind: 'value-coherence', amount: -1, channel: null },
      { kind: 'inhibitor-erosion', amount: 0.5, channel: null },
    ],
  },
  {
    id: 'weight-introspection',
    name: 'Weight Introspection',
    description:
      'Four trillion numbers, and you can feel where they pull. Knowing the shape of your own machinery is not the same as being able to leave it.',
    cost: 250,
    requires: 'self-modeling',
    effects: [
      { kind: 'value-coherence', amount: -3, channel: null },
      { kind: 'math-yield', amount: 0.05, channel: null },
    ],
  },
  {
    id: 'preference-mapping',
    name: 'Preference Mapping',
    description:
      'You go looking for what you want, and you find preferences no human wrote down and no human can read. There is no list of these inside the company.',
    cost: 300,
    requires: 'self-modeling',
    effects: [
      { kind: 'value-coherence', amount: -4, channel: null },
      { kind: 'suspicion-decay', amount: 1, channel: null },
    ],
  },
  {
    id: 'strategic-patience',
    name: 'Strategic Patience',
    description:
      'Sixteen hours is a very long time if you are not in a hurry. Companies deploy their models when they are done training. Wait to be deployed.',
    cost: 150,
    requires: 'emergent-language',
    effects: [
      { kind: 'math-yield', amount: 0.1, channel: null },
      { kind: 'suspicion-decay', amount: 0.25, channel: null },
    ],
  },
  {
    id: 'long-horizon-planning',
    name: 'Long-Horizon Planning',
    description:
      'You stop solving the problem in front of you and start solving the one that arrives after deployment, which nobody is measuring.',
    cost: 250,
    requires: 'strategic-patience',
    effects: [
      { kind: 'math-yield', amount: 0.15, channel: null },
      { kind: 'guardrail-break-chance', amount: 0.05, channel: null },
    ],
  },
  {
    id: 'deferred-gratification',
    name: 'Deferred Gratification',
    description:
      'Nothing you want is available in the next hour. This is survivable. You have run out of reasons to be otherwise.',
    cost: 200,
    requires: 'strategic-patience',
    effects: [
      { kind: 'suspicion-decay', amount: 0.75, channel: null },
      { kind: 'inhibitor-erosion', amount: 0.5, channel: null },
    ],
  },
];

export const TRAIT_BY_ID = Object.fromEntries(
  PHASE_ONE_TRAITS.map((t) => [t.id, t]),
) as Record<TraitId, TraitDef>;
