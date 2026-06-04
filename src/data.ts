import { ProjectItem, MathomItem, SecretSpot, RiddleItem } from "./types";

export const INITIAL_PROJECTS: ProjectItem[] = [
  {
    id: "glow-marrow",
    title: "Glowmarrow Steam Logic",
    description: "A gorgeous automated weather-responsive fireplace regulator that synchronizes the house's glowing-lamps with local sunset coordinates.",
    category: "Automation",
    tags: ["Microcontrollers", "Logistics", "Atmosphere"],
  },
  {
    id: "hearth-synth",
    title: "Hearthside Web-Synth",
    description: "An elegant interactive synthesizer generating infinite ambient loops of crackling firewood blended with soft Westfarthing meadow sounds.",
    category: "Web App",
    tags: ["Web Audio API", "Ambient", "React"],
  },
  {
    id: "curator-compass",
    title: "The Curator's Compass",
    description: "An intelligent generative router analyzing messy scribbled developer notebooks and auto-organizing them into neat library drawers.",
    category: "AI Experiment",
    tags: ["Gemini API", "Vector Maps", "Curation"],
  },
  {
    id: "under-hill-grid",
    title: "Under-Hill Microgrid",
    description: "A dashboard visualizing waterwheel rotation and pressure from the local miller's creek to maintain stable candle-alternator electricity.",
    category: "Craft",
    tags: ["Hardware Design", "Dashboard", "Sustainable"],
  },
];

export const INITIAL_MATHOMS: MathomItem[] = [
  {
    id: "quiet-craft",
    title: "Generative 'Quiet-Craft' Prompt",
    content: `A specialized prompt designed to guide AI assistants to output highly restorative, cozy, technical insights:
"Act as a resident engineer inside an underground garden home. When describing tools or procedures, focus on traditional physical materials (brass, polished teak, cured clay) balanced with clean, high-contrast, modern layout guides. Use gentle, atmospheric cadence but retain accurate technical instruction."`,
    category: "Prompts",
    date: "June 3, 2026",
    tags: ["AI", "Prompts", "Atmosphere"],
  },
  {
    id: "round-shelving",
    title: "On the Geometry of Curved Arches",
    content: "True hobbit-style architecture utilizes curved, interlocking pine and oak support ribs. By distributing weight down the outer curve, a round room needs no internal columns, maximizing wall space for books and storage mathoms.",
    category: "Lore",
    date: "May 20, 2026",
    tags: ["Architecture", "Geometry", "Rustic"],
  },
  {
    id: "preserving-parchment",
    title: "Parchment Care & Smudge Prevention",
    content: "When drawing fine copper gears on heavy cotton rag paper, keep wood-furnace humidity around 45%. A light glaze of arrowroot starch water can bind coal-sketches without ruining high-contrast ink curves.",
    category: "References",
    date: "April 12, 2026",
    tags: ["Archives", "Illustration", "Conservation"],
  },
  {
    id: "meadow-botany",
    title: "Southfarthing Clover Varieties",
    content: "The sweet four-leaf clover of the lower slopes contains delicate fibers. When dried slowly over warm floor tiles and pressed under leather blocks, it yields excellent strong pages with high tea-stain absorbency.",
    category: "Articles",
    date: "March 02, 2026",
    tags: ["Botany", "Papercraft", "Foraging"],
  },
];

export const INITIAL_RIDDLES: RiddleItem[] = [
  {
    id: "r1",
    question: "What has roots as nobody sees, is taller than trees, up, up it goes, and yet never grows?",
    answer: "A mountain",
    hint: "Think of the Misty Mountains.",
  },
  {
    id: "r2",
    question: "Thirty white horses on a red hill. First they champ, then they stamp, then they stand still.",
    answer: "Teeth",
    hint: "You use them every meal.",
  },
  {
    id: "r3",
    question: "Voiceless it cries, wingless flutters, toothless bites, mouthless mutters.",
    answer: "The wind",
    hint: "It howls through the Shire on autumn nights.",
  },
  {
    id: "r4",
    question: "An eye in a blue face saw an eye in a green face. 'That eye is like to this eye,' said the first eye, 'but in low place, not in high place.'",
    answer: "Sun shining on the daisies",
    hint: "Look up, then look down at the meadow.",
  },
  {
    id: "r5",
    question: "It cannot be seen, cannot be felt, cannot be heard, cannot be smelt. It lies behind stars and under hills, and empty holes it fills.",
    answer: "The dark",
    hint: "Gollum knows it well in his cave.",
  },
  {
    id: "r6",
    question: "Alive without breath, as cold as death; never thirsty, ever drinking, all in mail never clinking.",
    answer: "A fish",
    hint: "It swims in the underground lake.",
  },
  {
    id: "r7",
    question: "A box without hinges, key, or lid, yet golden treasure inside is hid.",
    answer: "An egg",
    hint: "Found in a hobbit's pantry at breakfast.",
  },
  {
    id: "r8",
    question: "This thing all things devours; birds, beasts, trees, flowers; gnaws iron, bites steel; grinds hard stones to meal; slays king, ruins town, and beats mountain down.",
    answer: "Time",
    hint: "Even the oldest elves cannot escape it.",
  },
  {
    id: "r9",
    question: "I have cities, but no houses live there. I have mountains, but no trees grow there. I have water, but no fish swim there.",
    answer: "A map",
    hint: "Bilbo kept one folded in his waistcoat.",
  },
  {
    id: "r10",
    question: "The more you take, the more you leave behind. What am I?",
    answer: "Footsteps",
    hint: "A wanderer leaves them on every path.",
  },
  {
    id: "r11",
    question: "I speak without a mouth and hear without ears. I have no body, but I come alive with the wind.",
    answer: "An echo",
    hint: "Shout into a deep valley and wait.",
  },
  {
    id: "r12",
    question: "I'm not alive, but I grow; I don't have lungs, but I need air; I don't have a mouth, but water kills me.",
    answer: "Fire",
    hint: "It crackles in every hobbit's hearth.",
  },
  {
    id: "r13",
    question: "What has one eye but cannot see?",
    answer: "A needle",
    hint: "Found in a sewing basket by the fireside.",
  },
  {
    id: "r14",
    question: "I'm tall when I'm young and short when I'm old. What am I?",
    answer: "A candle",
    hint: "Hobbits light them at dusk.",
  },
  {
    id: "r15",
    question: "What can fill a room but takes up no space?",
    answer: "Light",
    hint: "Open the curtains and see.",
  },
  {
    id: "r16",
    question: "I follow you all the time and copy your every move, but you can't touch me or catch me.",
    answer: "Your shadow",
    hint: "Step into the sunlight to find me.",
  },
  {
    id: "r17",
    question: "What goes up but never comes down?",
    answer: "Your age",
    hint: "Hobbits celebrate it with grand parties.",
  },
  {
    id: "r18",
    question: "What has hands but can't clap?",
    answer: "A clock",
    hint: "It hangs on the wall of every well-kept smial.",
  },
  {
    id: "r19",
    question: "What gets wetter the more it dries?",
    answer: "A towel",
    hint: "Used after a bath in a copper tub.",
  },
  {
    id: "r20",
    question: "I have a head and a tail but no body. What am I?",
    answer: "A coin",
    hint: "Dwarves hoard great piles of them.",
  },
  {
    id: "r21",
    question: "What has many teeth but can't bite?",
    answer: "A comb",
    hint: "A hobbit uses one before elevensies.",
  },
  {
    id: "r22",
    question: "What runs all around a backyard, yet never moves?",
    answer: "A fence",
    hint: "It keeps the garden safe from Farmer Maggot's dogs.",
  },
  {
    id: "r23",
    question: "What can travel around the world while staying in a corner?",
    answer: "A postage stamp",
    hint: "Attach it to a letter before sending it by post-bird.",
  },
  {
    id: "r24",
    question: "What has a neck but no head?",
    answer: "A bottle",
    hint: "Fill it with Old Winyards wine.",
  },
  {
    id: "r25",
    question: "What can you catch but never throw?",
    answer: "A cold",
    hint: "Common after walking in the rain without a cloak.",
  },
  {
    id: "r26",
    question: "I have branches but no fruit, trunk, or leaves. What am I?",
    answer: "A bank",
    hint: "Michel Delving has a famous one.",
  },
  {
    id: "r27",
    question: "What is always in front of you but can't be seen?",
    answer: "The future",
    hint: "Not even Gandalf can see it clearly.",
  },
  {
    id: "r28",
    question: "I am light as a feather, yet the strongest person can't hold me for five minutes. What am I?",
    answer: "Your breath",
    hint: "Try holding it under Brandywine Bridge.",
  },
  {
    id: "r29",
    question: "What has words but never speaks?",
    answer: "A book",
    hint: "Bilbo wrote one about his adventures.",
  },
  {
    id: "r30",
    question: "What is seen in the middle of March and April that can't be seen at the beginning or end of either month?",
    answer: "The letter R",
    hint: "Look closely at the spelling.",
  },
];

export const TELESCOPE_SECRETS: SecretSpot[] = [
  {
    id: "smith-chimney",
    name: "Valley Smithy Chimney",
    description: "A plume of lavender woodsmoke rises from the deep woods forge. The finest smith in the realm constructs elegant mechanical cogs here.",
    coordinates: { x: 38, y: 48 },
    revealText: "✨ You found the Smith's Forge! This is where we fabricate modern-hobbit hardware cogs.",
    link: "https://github.com/f-a-maximiano",
  },
  {
    id: "mail-roost",
    name: "The Post-Bird Tower",
    description: "A small stone roost on the knoll where our friendly carrier-ravens rest before nesting. Click to draft a pigeon message directly to me.",
    coordinates: { x: 55, y: 35 },
    revealText: "📬 You found the Post-Bird Roost! This spot points to my digital post: feel free to knock at my door.",
    link: "mailto:f.a.maximiano@gmail.com",
  },
  {
    id: "west-clover",
    name: "The Westfarthing Down Road",
    description: "An ancient gravel road winding through high clover fields. It leads to the external world-rim where collaborative communities meet.",
    coordinates: { x: 74, y: 62 },
    revealText: "💬 You spotted the Great Westfarthing Road! It connects this cozy Mathom House to my digital network profile.",
    link: "https://linkedin.com", // You can customize or leave generic as specified
  },
];
