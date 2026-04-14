export type RasterFormat = "png" | "jpeg" | "webp";

export const formatToMime: Record<RasterFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function canvasToBlob(canvas: HTMLCanvasElement, format: RasterFormat, quality: number): Promise<Blob> {
  const mime = formatToMime[format];
  const finalQuality = Math.max(0.1, Math.min(1, quality));

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Nie udalo sie wygenerowac pliku obrazu."));
          return;
        }
        resolve(blob);
      },
      mime,
      format === "png" ? undefined : finalQuality
    );
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
