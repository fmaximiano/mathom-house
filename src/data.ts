import { ProjectItem, MathomItem, SecretSpot } from "./types";

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
