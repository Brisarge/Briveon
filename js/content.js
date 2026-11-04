// Everything on the public site that you'd want to edit lives here.
// Add a game: copy a block in `projects`, change the fields, save, push.
//
// Fields:
//   title     shown on the card
//   platform  "Roblox", "Unity", "Web", ...
//   status    short label: "In beta", "Released", "Prototype", ...
//   blurb     one or two sentences (leave '' to hide)
//   tags      short labels shown under the blurb
//   link      where the card's button goes ('' = no button)
//   linkLabel button text (defaults to "Play")
//   image     path to a screenshot, e.g. 'assets/images/realmng.jpg' ('' = drawn motif)
//   motif     drawn cover art used when there's no image:
//             'cards' | 'bars' | 'orbits' | 'climb' | 'tower'
//   featured  true = the big card at the top (use on one project)

export const projects = [
  {
    id: 'realmng',
    title: 'RealmNG: Card Battles',
    platform: 'Roblox',
    status: 'In beta',
    blurb:
      'A card-collecting battler. Roll for cards across rarity tiers, build a deck, and take on area bosses, with live events like the Star Fall meteor shower.',
    tags: ['Luau', 'Card economy', 'Boss battles', 'Live events'],
    role: 'Built with Rog at BrainDrain Studio',
    link: '', // TODO Bris: public Roblox game URL
    linkLabel: 'Play on Roblox',
    image: '',
    motif: 'cards',
    featured: true,
  },
  {
    id: 'rhythm-rush',
    title: 'Rhythm Rush / Visualizer',
    platform: 'Web',
    status: 'Playable here',
    blurb:
      'A 12×12 grid of neon cubes driven by live frequency analysis, with polyrhythmic motion locked to the track tempo.',
    tags: ['three.js', 'Web Audio', 'Bloom'],
    link: '#lab',
    linkLabel: 'Open in the Lab',
    image: '',
    motif: 'bars',
  },
  {
    id: 'solar-system',
    title: 'Procedural Solar System',
    platform: '', // TODO Bris
    status: '',
    blurb: '', // TODO Bris: one line
    tags: ['Procedural generation'],
    link: '',
    image: '',
    motif: 'orbits',
  },
  {
    id: 'climb-of-chaos',
    title: 'Climb of Chaos',
    platform: '', // TODO Bris
    status: '',
    blurb: '', // TODO Bris: one line
    tags: [],
    link: '',
    image: '',
    motif: 'climb',
  },
  {
    id: 'tower-destruction',
    title: 'Tower Destruction Survival',
    platform: '', // TODO Bris
    status: '',
    blurb: '', // TODO Bris: one line
    tags: [],
    link: '',
    image: '',
    motif: 'tower',
  },
];

// Contact links. Only entries with a url are shown.
export const links = [
  { label: 'GitHub', url: 'https://github.com/Brisarge' },
  { label: 'Roblox', url: '' }, // TODO Bris: profile or BrainDrain Studio group URL
  { label: 'YouTube', url: '' },
  { label: 'Email', url: '' }, // e.g. 'mailto:you@example.com'
];

// Tracks for the Lab visualizer.
export const tracks = [
  { name: 'Space Race', src: 'assets/music/space_race.mp3' },
  { name: 'Flow', src: 'assets/music/flow.mp3' },
];
