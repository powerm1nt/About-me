import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import matter from "gray-matter";

const rootDir = process.cwd();

export interface ArticleMeta {
  filePath: string;
  title: string;
  description: string;
  author: string;
  lastEdited: string;
  lastEditedIso: string;
  created?: string;
}

const getGitDate = (filePath: string): { lastEditedIso: string; createdIso: string } => {
  try {
    const lastEditedStr = execSync(`git log -1 --format="%cI" -- "${filePath}"`, {
      cwd: rootDir,
      encoding: "utf-8",
    }).trim();

    const createdStr = execSync(`git log --follow --format="%aI" -- "${filePath}"`, {
      cwd: rootDir,
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .pop() || "";

    const stat = fs.existsSync(path.resolve(rootDir, filePath))
      ? fs.statSync(path.resolve(rootDir, filePath))
      : null;

    const lastEditedIso = lastEditedStr || (stat ? stat.mtime.toISOString() : new Date().toISOString());
    const createdIso = createdStr || (stat ? stat.birthtime.toISOString() : lastEditedIso);

    return { lastEditedIso, createdIso };
  } catch {
    const stat = fs.statSync(path.resolve(rootDir, filePath));
    return {
      lastEditedIso: stat.mtime.toISOString(),
      createdIso: stat.birthtime.toISOString(),
    };
  }
};

const formatDate = (isoString: string): string => {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch {
    return isoString;
  }
};

export const generateMetadata = () => {
  const filesToScan: string[] = [];

  if (fs.existsSync(path.resolve(rootDir, "README.mdx"))) {
    filesToScan.push("README.mdx");
  }

  const scanDir = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".mdx"))) {
        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, "/");
        filesToScan.push(relPath);
      }
    }
  };

  scanDir(path.resolve(rootDir, "blog"));

  const metadataMap: Record<string, ArticleMeta> = {};

  for (const relPath of filesToScan) {
    const absPath = path.resolve(rootDir, relPath);
    const content = fs.readFileSync(absPath, "utf-8");
    const { data } = matter(content);
    const { lastEditedIso, createdIso } = getGitDate(relPath);

    let title = data.title || "";
    if (!title) {
      const headingMatch = content.match(/^#\s+(.+)$/m);
      if (headingMatch && headingMatch[1]) {
        title = headingMatch[1].trim();
      } else {
        title = path.basename(relPath, path.extname(relPath));
      }
    }

    metadataMap[relPath] = {
      filePath: relPath,
      title,
      description: data.description || "",
      author: data.author || "Pookie (powerm1nt)",
      lastEditedIso,
      lastEdited: data.lastEdited || formatDate(lastEditedIso),
      created: formatDate(createdIso),
    };
  }

  const publicOut = path.resolve(rootDir, "public/articles-metadata.json");
  const srcGenDir = path.resolve(rootDir, "src/generated");
  if (!fs.existsSync(srcGenDir)) {
    fs.mkdirSync(srcGenDir, { recursive: true });
  }
  const srcOut = path.resolve(rootDir, "src/generated/articles-metadata.json");

  const jsonStr = JSON.stringify(metadataMap, null, 2);
  fs.writeFileSync(publicOut, jsonStr, "utf-8");
  fs.writeFileSync(srcOut, jsonStr, "utf-8");

  // Generate sitemap.xml
  const sitemapOut = path.resolve(rootDir, "public/sitemap.xml");
  let baseUrl = "https://p.nuka.works";
  const cnamePath = path.resolve(rootDir, "public/CNAME");
  if (fs.existsSync(cnamePath)) {
    const cname = fs.readFileSync(cnamePath, "utf-8").trim();
    if (cname) baseUrl = `https://${cname}`;
  }

  let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  
  // Add root url
  sitemapXml += `  <url>\n    <loc>${baseUrl}/</loc>\n    <lastmod>${metadataMap["README.mdx"]?.lastEditedIso || new Date().toISOString()}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

  for (const relPath of Object.keys(metadataMap)) {
    if (relPath === "README.mdx") continue;
    const loc = `${baseUrl}/?file=${encodeURIComponent(relPath)}`;
    const lastmod = metadataMap[relPath]?.lastEditedIso || new Date().toISOString();
    sitemapXml += `  <url>\n    <loc>${loc.replace(/&/g, "&amp;")}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
  }
  sitemapXml += `</urlset>\n`;
  fs.writeFileSync(sitemapOut, sitemapXml, "utf-8");

  console.log(`[blog-metadata] Generated metadata for ${Object.keys(metadataMap).length} files.`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  generateMetadata();
}
