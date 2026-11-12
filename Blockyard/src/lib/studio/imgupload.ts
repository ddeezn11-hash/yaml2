"use client";

/* Image picker + downscaler used for part/baseplate textures. */

export interface PickedImage {
  dataUrl: string;
  name: string;
  width: number;
  height: number;
}

/**
 * Opens a file picker and returns a downscaled data URL (default max 1024px
 * on the long edge; pass a smaller maxSide for chat images) so payloads stay
 * well inside the localStorage / websocket limits.
 */
export function pickImage(maxSide = 1024): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,image/*";
    input.style.display = "none";
    document.body.appendChild(input);
    let settled = false;
    const done = (result: PickedImage | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(result);
    };
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return done(null);
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return done(null);
          ctx.drawImage(img, 0, 0, w, h);
          const isPng = file.type === "image/png";
          let dataUrl = canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.86);
          if (dataUrl.length > 2_800_000 && isPng) {
            // huge png with alpha — fall back to jpeg on white
            const c2 = document.createElement("canvas");
            c2.width = w;
            c2.height = h;
            const x2 = c2.getContext("2d")!;
            x2.fillStyle = "#ffffff";
            x2.fillRect(0, 0, w, h);
            x2.drawImage(canvas, 0, 0);
            dataUrl = c2.toDataURL("image/jpeg", 0.82);
          }
          done({ dataUrl, name: file.name, width: w, height: h });
        };
        img.onerror = () => done(null);
        img.src = String(reader.result);
      };
      reader.onerror = () => done(null);
      reader.readAsDataURL(file);
    });
    // cancelled picker
    window.addEventListener("focus", () => setTimeout(() => { if (!settled && !input.files?.length) done(null); }, 800), { once: true });
    input.click();
  });
}
