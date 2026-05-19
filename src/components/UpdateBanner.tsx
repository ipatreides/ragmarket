import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReleaseInfo } from "../lib/updates";

type Props = {
  release: ReleaseInfo;
  onDismiss: () => void;
};

export function UpdateBanner({ release, onDismiss }: Props) {
  return (
    <div className="update-banner">
      <button
        className="update-banner__link"
        onClick={() => {
          void openUrl(release.htmlUrl);
        }}
      >
        Nova versão {release.tagName} disponível — clique para baixar
      </button>
      <button
        className="update-banner__close"
        onClick={onDismiss}
        aria-label="Dispensar"
        title="Dispensar"
      >
        ×
      </button>
    </div>
  );
}
