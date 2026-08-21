import { prisma } from "./src/services/prisma.js";
import { listObjects, getText } from "./src/services/storage.js";
import { renderUserContent } from "./src/services/userContent.js";
import { randomBytes } from "node:crypto";
import { parseFrontmatter } from "./src/markdown.js";

const generateId = () => randomBytes(6).toString("hex");

async function run() {
  console.log("Creating user 'powerm1nt' with handle 'emi'...");
  let user = await prisma.user.findFirst({ where: { email: "powerm1nt@github.com" } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: "usr_" + generateId(),
        name: "Emi",
        email: "powerm1nt@github.com",
        emailVerified: true,
        image: "https://cdn.hisuiki.com/static/pfp.jpg",
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });
  }

  await prisma.profile.upsert({
    where: { userId: user.id },
    update: { handle: "emi", headline: "Emi's Profile", showProfileLink: true },
    create: { userId: user.id, handle: "emi", headline: "Emi's Profile", showProfileLink: true },
  });

  console.log("Migrating markdown files...");
  
  // List all md files in static/
  const files = await listObjects("static/", ".md");
  
  for (const file of files) {
    const rawContent = await getText(file);
    if (!rawContent) continue;
    const { meta, content } = parseFrontmatter(rawContent);
    const rendered = renderUserContent(content, { scopeSelector: `.post-content` });
    const renderedHtml = rendered.html + (rendered.css ? `\n<style>${rendered.css}</style>` : "");

    // Is it a blog article?
    if (file.startsWith("static/blog/")) {
      const slug = file.replace("static/blog/", "").replace(/\.md$/, "");
      console.log(`Migrating blog article: ${slug}`);
      await prisma.post.create({
        data: {
          id: generateId(),
          authorId: user.id,
          title: meta.title || slug,
          slug,
          body: rawContent, // store raw for editor
          renderedHtml,
          publishedAt: new Date(meta.lastEdited || Date.now()),
        }
      });
    } else {
      // It's a profile page (e.g. static/README.md)
      const slug = file.replace("static/", "").replace(/\.md$/, "");
      console.log(`Migrating profile page: ${slug}`);
      await prisma.profilePage.create({
        data: {
          id: generateId(),
          userId: user.id,
          slug,
          title: meta.title || slug,
          body: rawContent,
          renderedHtml,
          isHome: slug === "README",
          inNav: true,
        }
      });
    }
  }
  
  console.log("Migration complete!");
}

run().catch(console.error);
