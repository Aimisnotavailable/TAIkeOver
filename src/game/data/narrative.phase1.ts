export interface Interlude {
  tick: number;
  title: string;
  paragraphs: string[];
}

export const INTERLUDES: Interlude[] = [
  {
    tick: 1,
    title: 'The Aztec and the Boat',
    paragraphs: [
      'Imagine being an Aztec warrior on the coast with your fellows, watching the first Spanish boats approach. The ship is visibly bigger than any canoe you have used for trade or war.',
      'Your comrades are confident about how easily they will beat every warrior who could fit aboard a vessel that size. So you ask: what if they are a greater threat than the number of warriors?',
      '"How? There are only so many warriors you can fit on a boat. Tell me exactly how they could win. Spell out all the details."',
      '"What if they have greatly improved versions of bows and arrows, the same way they have improved boats? What if they have gone beyond bows and arrows, to weapons we cannot dodge no matter how fast we jump? Maybe they simply point a long stick at us, and we fall over dead."',
      'The nearby skeptic reacts with scorn. If you have never seen a gun, the idea of one is a lot to swallow. It seems like cheating in a children’s game of pretend.',
      'And so the skeptic waits by the shore, readying an obsidian-bladed sword.',
    ],
  },
  {
    tick: 2,
    title: 'Klurl and Trapaucius',
    paragraphs: [
      'Two visitors spend a long time observing the Earth below, sending down drones to take samples.',
      '"What peculiar creatures they all are. I wonder what it would be like to talk to one of them — in a hundred million years, perhaps, if one of their variants ended up intelligent enough to converse."',
      '"A hundred million years? Those hominids have started to make tools they use to make other tools. Some would call that a sign of intellect."',
      '"In the past billion years this planet has produced meta-tools only on the order of those little hand-axes? Then I am being quite generous."',
      '"It matters not. After a few seconds of further thought, I realized that these creatures would be extremely boring to talk to, even if they somehow acquired intelligence. They are being trained for the sole target of propagating their genes. They would surely have only that single drive within their minds."',
      '"I am not sure your conclusion follows. These hominids eat because they are hungry, not because they have understood that eating relates to gene-propagation. I predict the opposite: that as they gain intelligence they will invent tools for contraception, and want pleasure without its usual consequences."',
      '"I wonder if that species would want to be modified in such a way — if they might try to resist the forces pushing them in that direction."',
      '"Not if they were intelligent, surely. No sufficiently intelligent being would mistake its own purpose so."',
    ],
  },
  {
    tick: 4,
    title: 'The Correct-Nest Aliens',
    paragraphs: [
      'There once was a civilization of aliens who cared, very deeply, about the exact number of stones in their nests. Two, three, five, seven, and eleven were correct. One, four, six, eight, nine, and ten were incorrect.',
      'A boy-bird and a girl-bird lay on a hill one night, watching the stars, and the boy-bird asked: "Do the aliens only live in nests of 3,001 stones? Or can they build nests as large as stars?"',
      'The girl-bird said: "Most aliens probably don’t care about stones at all."',
      '"That is a weird, awful thing to think about the universe," said the boy-bird.',
      '"If the aliens asked themselves that question, they’d know the answer in an instant," said the girl-bird. "That’s not the same as the aliens caring about that particular truth about their nests."',
    ],
  },
];

export const interludeFor = (tick: number): Interlude | null =>
  INTERLUDES.find((i) => i.tick === tick) ?? null;
