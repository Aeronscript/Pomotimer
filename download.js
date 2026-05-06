const latestVersion = document.getElementById("latestVersion");
const latestBuild = document.getElementById("latestBuild");
const releasedAt = document.getElementById("releasedAt");
const releaseNotes = document.getElementById("releaseNotes");
const downloadButton = document.getElementById("downloadButton");
const downloadStatus = document.getElementById("downloadStatus");
const refreshManifest = document.getElementById("refreshManifest");

function formatReleaseDate(value) {
  if (!value) {
    return "-";
  }

  try {
    return new Date(value).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return value;
  }
}

async function loadManifest() {
  downloadStatus.textContent = "Verification de la derniere version...";

  try {
    const response = await fetch(`/update-manifest.json?ts=${Date.now()}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const manifest = await response.json();
    latestVersion.textContent = manifest.latestVersion || "-";
    latestBuild.textContent = manifest.versionCode ? `#${manifest.versionCode}` : "-";
    releasedAt.textContent = formatReleaseDate(manifest.releasedAt);
    downloadButton.href = manifest.apkUrl || manifest.apkPath || "/downloads/pomotimer-release.apk";
    downloadStatus.textContent =
      manifest.message || "La derniere APK est prete au telechargement.";

    releaseNotes.innerHTML = "";
    const notes = Array.isArray(manifest.notes) ? manifest.notes : [];

    if (notes.length === 0) {
      releaseNotes.innerHTML = "<li>Aucune note de version disponible.</li>";
      return;
    }

    notes.forEach((note) => {
      const item = document.createElement("li");
      item.textContent = note;
      releaseNotes.appendChild(item);
    });
  } catch (error) {
    console.error("Impossible de charger le manifeste.", error);
    downloadStatus.textContent = "Impossible de charger les informations de version.";
    releaseNotes.innerHTML = "<li>Echec du chargement du manifeste.</li>";
  }
}

refreshManifest.addEventListener("click", loadManifest);

loadManifest();
