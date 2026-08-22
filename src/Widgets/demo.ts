import type { ProfileScope } from "../Types";
import type { ProfileData } from "../Types";
import type { PostSummary } from "../Types";

/**
 * Stand-in content, so a gallery tile shows a working widget rather than an empty one.
 *
 * The profile widgets read what they show from a scope, and the gallery sits outside any profile —
 * so previewing them honestly would mean a shelf of blank tiles with captions under them, which is
 * exactly what showing the real widget was meant to replace. They get a plausible profile instead.
 *
 * Everything here is obviously invented. That is on purpose: a preview filled with the viewer's own
 * name and posts reads as the page rather than as a sample of one, and someone would eventually
 * wonder why deleting a tile did not delete the post in it.
 */

const DAY = 86_400_000;

/** Dates spread across the last year, so the activity grid has a shape instead of one dark row. */
function demoDates(): string[] {
  const now = Date.now();
  const dates: string[] = [];

  for (let day = 0; day < 365; day++) {
    // A deterministic scatter, denser in recent months. Not random: a preview that reshuffles on
    // every render draws the eye to the wrong thing.
    const weight = (Math.sin(day / 9) + 1) * (1 - day / 500);
    const count = Math.round(weight * 2);
    for (let n = 0; n < count; n++) dates.push(new Date(now - day * DAY).toISOString());
  }

  return dates;
}

const post = (id: string, title: string, body: string, ageDays: number): PostSummary =>
  ({
    id,
    slug: id,
    title,
    renderedHtml: `<p>${body}</p>`,
    createdAt: new Date(Date.now() - ageDays * DAY).toISOString(),
    media: [],
    author: { id: "demo", name: "Ash Mercier", image: null, profile: { handle: "ash" } },
    _count: { likes: 12, comments: 3, reposts: 1 },
  }) as unknown as PostSummary;

const DEMO_POSTS: PostSummary[] = [
  post("demo-readme", "README", "Building things on the web, mostly at night.", 40),
  post("demo-1", "A quieter build", "Swapped the fans out. The room is liveable again.", 2),
  post("demo-2", "Notes on colour", "Six months of picking accents and I still reach for blue.", 9),
  post("demo-3", "Field recording", "Rain on a tin roof, thirty minutes, no edits.", 21),
];

const DEMO_PROFILE = {
  userId: "demo",
  handle: "ash",
  headline: "Builds things, mostly at night",
  bio: null,
  customCss: null,
  wallpaperPath: null,
  avatarPath: null,
  accentColor: null,
  headerLinks: [],
  profileLinks: [
    { label: "Notes", href: "https://example.com/notes" },
    { label: "Code", href: "https://example.com/code" },
  ],
  publicEmail: "ash@example.com",
  location: "Lyon",
  pronouns: "they/them",
  showProfileLink: true,
  layout: {},
  user: { id: "demo", name: "Ash Mercier", image: null },
} as unknown as ProfileData;

/**
 * Real where it is real, invented where it would be empty.
 *
 * A tile should show the actual profile and the actual posting history — that is what makes it a
 * preview of *your* page rather than of a page. The exception is anything the owner has to write
 * first: an unset links widget, an unwritten bio and an empty timeline preview as blank boxes, which
 * says nothing about what they are for. Those keep the sample content.
 */
export function galleryScope(real: ProfileScope | null): ProfileScope {
  if (!real) return DEMO_SCOPE;

  return {
    ...DEMO_SCOPE,
    // The person, as they actually are.
    profile: {
      ...real.profile,
      // Except the links, which are theirs to add and usually have not been.
      profileLinks: real.profile.profileLinks.length > 0 ? real.profile.profileLinks : DEMO_PROFILE.profileLinks,
    },
    handle: real.handle,
    // Their real posting history, which is the whole point of the activity widget.
    activityDates: real.posts.length > 0 ? real.posts.map((post) => post.createdAt) : DEMO_SCOPE.activityDates,
    // Written content stays sampled: a bio nobody has written is not a preview of anything.
    readme: real.readme ?? DEMO_SCOPE.readme,
    timeline: real.timeline.length > 0 ? real.timeline : DEMO_SCOPE.timeline,
    posts: real.posts.length > 0 ? real.posts : DEMO_SCOPE.posts,
  };
}

/** One scope, built once: the heatmap's year of dates is not worth recomputing per tile. */
export const DEMO_SCOPE: ProfileScope = {
  profile: DEMO_PROFILE,
  posts: DEMO_POSTS,
  readme: DEMO_POSTS[0]!,
  timeline: DEMO_POSTS.slice(1),
  handle: "ash",
  activityDates: demoDates(),
};
