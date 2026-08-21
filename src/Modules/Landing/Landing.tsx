import { useEffect, useState } from "react";
import type { PostSummary } from "../../Services/types";
import { useAuth } from "../../Services/auth";


import { apiUrl, assetUrl } from "../../Services/config";
import Skeleton from "../../Common/Components/Skeleton/Skeleton";
import SmartImage from "../../Common/Components/SmartImage/SmartImage";

export interface LandingProps {
  isJapanese: boolean;
}

export default function Landing({ isJapanese }: LandingProps) {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const auth = useAuth();
  const [composerBody, setComposerBody] = useState("");
  const [composerPosting, setComposerPosting] = useState(false);

  const handlePost = async () => {
    if (!composerBody.trim()) return;
    setComposerPosting(true);
    try {
      const res = await fetch(apiUrl("/api/posts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: composerBody })
      });
      if (res.ok) {
        setComposerBody("");
        // Reload feed
        const data = await fetch(apiUrl("/api/posts")).then(r => r.json());
        setPosts(data.posts || []);
      }
    } catch (e) {
      alert("Failed to post");
    } finally {
      setComposerPosting(false);
    }
  };


  useEffect(() => {
    let active = true;
    fetch(apiUrl("/api/posts"))
      .then(r => r.json())
      .then(data => {
        if (active) {
          setPosts(data.posts || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="file-content" data-phase="ready">
      <h1>Hisuiki</h1>
      <p>{isJapanese ? "Hisuikiへようこそ" : "Welcome to Hisuiki"}</p>
      
      <div style={{ marginTop: "2rem" }}>
        
      {auth.isSignedIn && (
        <div style={{ background: "var(--color-surface)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--color-surface-border)", marginTop: "2rem", display: "flex", gap: "1rem", flexDirection: "column" }}>
          <textarea 
            placeholder={isJapanese ? "いまどうしてる？" : "What's happening?"}
            value={composerBody}
            onChange={e => setComposerBody(e.target.value)}
            style={{ width: "100%", minHeight: "80px", background: "transparent", border: "none", color: "var(--color-text)", fontSize: "1.1em", resize: "vertical", outline: "none" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-surface-veil)", paddingTop: "1rem" }}>
             <div>
                {/* Media buttons could go here */}
             </div>
             <button 
               className="editor-btn editor-btn-primary" 
               onClick={() => void handlePost()}
               disabled={!composerBody.trim() || composerPosting}
               style={{ padding: "0.5rem 1.5rem", borderRadius: "20px", fontWeight: "bold" }}
             >
               {composerPosting ? "..." : (isJapanese ? "ポストする" : "Post")}
             </button>
          </div>
        </div>
      )}

        <h2 style={{marginTop: "2rem"}}>{isJapanese ? "フィード" : "For You"}</h2>
        {loading ? <Skeleton width="100%" height="200px" /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem", marginTop: "1rem" }}>
            {posts.length === 0 ? (
              <p>{isJapanese ? "まだ投稿がありません。" : "No posts yet."}</p>
            ) : (
              posts.map(post => (
                <div key={post.id} style={{ border: "1px solid var(--color-surface-border)", padding: "1rem", borderRadius: "8px", background: "var(--color-surface)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                    {post.author.image && <SmartImage src={post.author.image} alt="" width="32px" height="32px" style={{ borderRadius: "50%" }} />}
                    <strong>{post.author.name || post.author.profile?.handle || "Someone"}</strong>
                    <span style={{ opacity: 0.7, fontSize: "0.85em" }}>@{post.author.profile?.handle || post.author.id}</span>
                  </div>
                  {post.title && <h3 style={{ marginTop: 0 }}>{post.title}</h3>}
                  {/* The first image only: a feed card is a preview, and the post's own page shows
                      the rest. thumbPath is null until a thumbnail has been generated, in which case
                      the full image stands in. */}
                  {post.media[0] && (
                    <div style={{ marginBottom: "1rem" }}>
                      <SmartImage
                        src={assetUrl(post.media[0].thumbPath ?? post.media[0].path)}
                        alt={post.media[0].alt}
                        block
                        style={{ maxWidth: "100%", borderRadius: "4px" }}
                      />
                    </div>
                  )}
                  <div dangerouslySetInnerHTML={{ __html: post.renderedHtml || post.body }} />
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
