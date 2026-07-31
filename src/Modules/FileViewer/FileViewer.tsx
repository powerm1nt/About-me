import React, { useEffect, useState, ComponentType } from "react";
import "./FileViewer.scss";
import { evaluate } from "@mdx-js/mdx";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import hljs from "highlight.js";
import "./_hljs.scss";
import Info from "../../Common/Components/Info/Info";

const RAW_REPO_BASE =
    "https://raw.githubusercontent.com/powerm1nt/About-me/main/";
const GITHUB_REPO_BASE = "https://github.com/powerm1nt/About-me/blob/main/";

const isExternal = (url: string): boolean => {
    return /^(https?:|\/\/|data:|mailto:|#)/i.test(url);
};

const normalizeRelativePath = (
    baseFile: string,
    relativePath: string,
): string => {
    let cleanRel = relativePath.replace(/^\.\//, "");
    if (cleanRel.startsWith("/public/")) {
        cleanRel = cleanRel.replace(/^\/public\//, "public/");
    } else if (cleanRel.startsWith("/")) {
        cleanRel = cleanRel.replace(/^\/+/, "");
    }
    const parts = baseFile.split("/");
    parts.pop(); // remove current filename

    const relParts = cleanRel.split("/");
    for (const part of relParts) {
        if (part === "..") {
            parts.pop();
        } else if (part !== "." && part !== "") {
            parts.push(part);
        }
    }
    return parts.join("/");
};

const resolveAssetUrl = (urlStr: string, currentFile: string): string => {
    if (!urlStr || isExternal(urlStr)) return urlStr;
    const path = normalizeRelativePath(currentFile, urlStr);
    return `${RAW_REPO_BASE}${path}`;
};

const resolveLinkUrl = (urlStr: string, currentFile: string): string => {
    if (!urlStr || isExternal(urlStr)) return urlStr;
    const path = normalizeRelativePath(currentFile, urlStr);
    if (path.endsWith(".md") || path.endsWith(".mdx")) {
        return `?file=${encodeURIComponent(path)}`;
    }
    return `${GITHUB_REPO_BASE}${path}`;
};

const stripMDXImportsAndExports = (text: string): string => {
    // Strip import statements (e.g. import Info from "...") to prevent MDX evaluate from requiring baseUrl / dynamic HTTP fetches
    return text
        .replace(/^import\s+[\s\S]*?from\s+['"][^'"]*['"];?/gm, "")
        .replace(/^import\s+['"][^'"]*['"];?/gm, "");
};

const fetchFileContent = async (file: string): Promise<string> => {
    if (
        import.meta.env.DEV &&
        (file === "README.mdx" || file === "README.md")
    ) {
        try {
            const localRes = await fetch(`/${file}`);
            if (localRes.ok) return await localRes.text();
        } catch {
            // Fallback to remote GitHub
        }
    }

    const primaryUrl = `${RAW_REPO_BASE}${file}`;
    const primaryRes = await fetch(primaryUrl);
    if (primaryRes.ok) {
        return await primaryRes.text();
    }

    if (file.endsWith(".mdx")) {
        const altUrl = `${RAW_REPO_BASE}${file.slice(0, -1)}`;
        const altRes = await fetch(altUrl);
        if (altRes.ok) return await altRes.text();
    } else if (file.endsWith(".md")) {
        const altUrl = `${RAW_REPO_BASE}${file}x`;
        const altRes = await fetch(altUrl);
        if (altRes.ok) return await altRes.text();
    }

    throw new Error(`Failed to load ${file} (HTTP ${primaryRes.status})`);
};

type MDXComponentProps = {
    components?: Record<string, React.ComponentType<unknown>>;
};

type ErrorState = {
    brief: string;
    stack?: string;
};

const FileViewer: React.FC = () => {
    const [filePath, setFilePath] = useState<string>("README.mdx");
    const [MDXContent, setMDXContent] =
        useState<ComponentType<MDXComponentProps> | null>(null);
    const [errorState, setErrorState] = useState<ErrorState | null>(null);

    useEffect(() => {
        const handleUrlChange = () => {
            const params = new URLSearchParams(window.location.search);
            const requestedFile = params.get("file") || "README.mdx";
            setFilePath(requestedFile);
        };

        handleUrlChange();
        window.addEventListener("popstate", handleUrlChange);
        return () => window.removeEventListener("popstate", handleUrlChange);
    }, []);

    useEffect(() => {
        let isMounted = true;

        fetchFileContent(filePath)
            .then(async (rawText) => {
                try {
                    const cleanedText = stripMDXImportsAndExports(rawText);
                    const { default: CompiledComponent } = await evaluate(
                        cleanedText,
                        {
                            Fragment,
                            jsx,
                            jsxs,
                            baseUrl: window.location.href,
                            useMDXComponents: () => ({ Info }),
                        },
                    );

                    if (isMounted) {
                        setErrorState(null);
                        setMDXContent(
                            () =>
                                CompiledComponent as ComponentType<MDXComponentProps>,
                        );
                        setTimeout(() => hljs.highlightAll(), 0);
                    }
                } catch (err: unknown) {
                    if (isMounted) {
                        if (err instanceof Error) {
                            setErrorState({
                                brief: err.message,
                                stack: err.stack,
                            });
                        } else {
                            setErrorState({ brief: String(err) });
                        }
                    }
                }
            })
            .catch((err: unknown) => {
                if (isMounted) {
                    if (err instanceof Error) {
                        setErrorState({ brief: err.message, stack: err.stack });
                    } else {
                        setErrorState({ brief: String(err) });
                    }
                }
            });

        return () => {
            isMounted = false;
        };
    }, [filePath]);

    const mdxComponents = {
        Info,
        img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
            const resolvedSrc = props.src
                ? resolveAssetUrl(props.src, filePath)
                : "";
            return <img {...props} src={resolvedSrc} />;
        },
        a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
            const resolvedHref = props.href
                ? resolveLinkUrl(props.href, filePath)
                : "";
            const isTargetExternal = !resolvedHref.startsWith("?");
            return (
                <a
                    {...props}
                    href={resolvedHref}
                    target={isTargetExternal ? "_blank" : undefined}
                    rel={isTargetExternal ? "noreferrer" : undefined}
                    onClick={(e) => {
                        if (props.onClick) props.onClick(e);
                        if (resolvedHref.startsWith("?")) {
                            e.preventDefault();
                            const params = new URLSearchParams(resolvedHref);
                            const targetFile = params.get("file");
                            if (targetFile) {
                                window.history.pushState({}, "", resolvedHref);
                                setFilePath(targetFile);
                            }
                        }
                    }}
                />
            );
        },
    };

    return (
        <main className="main-content">
            <div className="main-content-container">
                <div className="file-content">
                    {errorState ? (
                        <Info title={`Error: ${errorState.brief}`}>
                            {errorState.stack && errorState.stack}
                        </Info>
                    ) : MDXContent ? (
                        <MDXContent
                            components={
                                mdxComponents as Record<
                                    string,
                                    React.ComponentType<unknown>
                                >
                            }
                        />
                    ) : (
                        <p>Loading...</p>
                    )}
                </div>
            </div>
        </main>
    );
};

export default FileViewer;
