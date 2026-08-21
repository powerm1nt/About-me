import PhotoDetail from "./PhotoDetail";
import PhotoGallery from "./PhotoGallery";

export interface PhotosProps {
  /** Null on the gallery route; a post id on a photo's own page. */
  photoId: string | null;
  isJapanese: boolean;
}

/**
 * The photos pane. It reuses FileViewer's shell classes rather than inventing a second one, so the
 * gallery sits in the same column as every markdown page and inherits the Metro entrance — which
 * replays only on a remount, hence the key.
 */
export default function Photos({ photoId, isJapanese }: PhotosProps) {
  return (
    <main className="main-content">
      <div className="main-content-container">
        <div className="file-content" data-phase="ready" key={photoId ?? "gallery"}>
          {photoId ? (
            <PhotoDetail id={photoId} isJapanese={isJapanese} />
          ) : (
            <PhotoGallery isJapanese={isJapanese} />
          )}
        </div>
      </div>
    </main>
  );
}
