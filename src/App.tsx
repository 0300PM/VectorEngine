import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { renderSceneWithCanvas2D } from "./lib/jsRenderer";
import { canvasToBlob, downloadBlob, type RasterFormat } from "./lib/imageExport";
import { defaultSceneSource, parseSceneDefinition, scaleSceneDefinition } from "./lib/scene";
import { loadWasmEngine } from "./lib/wasmEngine";

type RenderBackend = "wasm" | "canvas2d";
type ResolutionMode = "scale" | "custom";

const scalePresets = [0.5, 1, 2, 4];

function extFromFormat(format: RasterFormat): string {
  if (format === "jpeg") {
    return "jpg";
  }
  return format;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [sceneSource, setSceneSource] = useState(defaultSceneSource);
  const [status, setStatus] = useState("Gotowe do renderowania.");
  const [isRendering, setIsRendering] = useState(false);
  const [activeBackend, setActiveBackend] = useState<RenderBackend>("canvas2d");

  const [resolutionMode, setResolutionMode] = useState<ResolutionMode>("scale");
  const [scalePreset, setScalePreset] = useState(1);
  const [customWidth, setCustomWidth] = useState("1920");
  const [customHeight, setCustomHeight] = useState("1080");
  const [exportFormat, setExportFormat] = useState<RasterFormat>("png");
  const [quality, setQuality] = useState(0.92);

  const helperText = useMemo(
    () =>
      "Silnik C++/WASM jest podzielony na moduly i renderuje sceny JSON (line, rect, circle, fill/stroke/transform). Eksport: PNG, JPEG, WEBP w wielu rozdzielczosciach.",
    []
  );

  const drawBufferToCanvas = useCallback((canvas: HTMLCanvasElement, width: number, height: number, data: Uint8Array | Uint8ClampedArray) => {
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Brak kontekstu Canvas 2D.");
    }

    ctx.putImageData(new ImageData(Uint8ClampedArray.from(data), width, height), 0, 0);
  }, []);

  const renderPixels = useCallback(async (sceneSourceValue: string, targetBackend: RenderBackend) => {
    const scene = parseSceneDefinition(sceneSourceValue);

    if (targetBackend === "wasm") {
      try {
        const wasm = await loadWasmEngine();
        const pixels = wasm.render(scene);
        return { scene, pixels, backendUsed: "wasm" as RenderBackend };
      } catch {
        const pixels = renderSceneWithCanvas2D(scene);
        return { scene, pixels, backendUsed: "canvas2d" as RenderBackend };
      }
    }

    const pixels = renderSceneWithCanvas2D(scene);
    return { scene, pixels, backendUsed: "canvas2d" as RenderBackend };
  }, []);

  const renderPreview = useCallback(
    async (backend: RenderBackend) => {
      setIsRendering(true);
      try {
        const { scene, pixels, backendUsed } = await renderPixels(sceneSource, backend);
        const canvas = canvasRef.current;
        if (!canvas) {
          throw new Error("Brak elementu canvas.");
        }

        drawBufferToCanvas(canvas, scene.width, scene.height, pixels);
        setActiveBackend(backendUsed);
        setStatus(
          backendUsed === "wasm"
            ? "Render OK przez C++/WebAssembly."
            : backend === "wasm"
              ? "WASM niedostepny, uzyto fallback Canvas 2D."
              : "Render OK przez fallback Canvas 2D (TypeScript)."
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Nieznany blad renderowania.";
        setStatus(`Blad: ${message}`);
      } finally {
        setIsRendering(false);
      }
    },
    [drawBufferToCanvas, renderPixels, sceneSource]
  );

  const resolveExportSize = useCallback((baseWidth: number, baseHeight: number) => {
    if (resolutionMode === "scale") {
      return {
        width: Math.max(1, Math.round(baseWidth * scalePreset)),
        height: Math.max(1, Math.round(baseHeight * scalePreset)),
      };
    }

    const width = Number.parseInt(customWidth, 10);
    const height = Number.parseInt(customHeight, 10);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new Error("Wlasna rozdzielczosc musi miec dodatnie width i height.");
    }
    return { width, height };
  }, [customHeight, customWidth, resolutionMode, scalePreset]);

  const exportSceneImage = useCallback(
    async (format: RasterFormat) => {
      setIsRendering(true);
      try {
        const parsed = parseSceneDefinition(sceneSource);
        const { width, height } = resolveExportSize(parsed.width, parsed.height);
        const sceneForExport =
          width === parsed.width && height === parsed.height ? parsed : scaleSceneDefinition(parsed, width, height);

        const pixels =
          activeBackend === "wasm"
            ? (await loadWasmEngine().then((wasm) => wasm.render(sceneForExport)).catch(() => renderSceneWithCanvas2D(sceneForExport)))
            : renderSceneWithCanvas2D(sceneForExport);

        const offscreen = document.createElement("canvas");
        drawBufferToCanvas(offscreen, width, height, pixels);

        const blob = await canvasToBlob(offscreen, format, quality);
        const backendLabel = activeBackend === "wasm" ? "wasm" : "canvas";
        const filename = `vector-scene-${width}x${height}-${backendLabel}.${extFromFormat(format)}`;
        downloadBlob(blob, filename);

        setStatus(`Wyeksportowano ${filename}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Nieznany blad eksportu.";
        setStatus(`Blad eksportu: ${message}`);
      } finally {
        setIsRendering(false);
      }
    },
    [activeBackend, drawBufferToCanvas, quality, resolveExportSize, sceneSource]
  );

  const exportAllFormats = useCallback(async () => {
    for (const format of ["png", "jpeg", "webp"] as RasterFormat[]) {
      await exportSceneImage(format);
    }
  }, [exportSceneImage]);

  useEffect(() => {
    void renderPreview("canvas2d");
  }, [renderPreview]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[1.08fr_1fr]">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.16em] text-blue-300">Vector Engine Lab</p>
            <h1 className="text-4xl font-semibold tracking-tight text-white">C++/WASM Raster Generator</h1>
            <p className="max-w-2xl text-sm text-slate-300">{helperText}</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
            <label htmlFor="scene-json" className="mb-2 block text-sm font-medium text-slate-200">
              Scene JSON
            </label>
            <textarea
              id="scene-json"
              className="h-[380px] w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-slate-100 outline-none transition focus:border-blue-400"
              value={sceneSource}
              onChange={(event) => setSceneSource(event.target.value)}
              spellCheck={false}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void renderPreview("wasm")}
                disabled={isRendering}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                Render WASM
              </button>
              <button
                type="button"
                onClick={() => void renderPreview("canvas2d")}
                disabled={isRendering}
                className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Render Fallback
              </button>
              <span className="self-center text-xs text-slate-400">Backend: {activeBackend}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <label className="text-xs text-slate-300">
                Tryb rozdzielczosci
                <select
                  className="mt-1 block rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                  value={resolutionMode}
                  onChange={(event) => setResolutionMode(event.target.value as ResolutionMode)}
                >
                  <option value="scale">Skalowanie sceny</option>
                  <option value="custom">Wlasna rozdzielczosc</option>
                </select>
              </label>

              {resolutionMode === "scale" ? (
                <label className="text-xs text-slate-300">
                  Skala
                  <select
                    className="mt-1 block rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                    value={String(scalePreset)}
                    onChange={(event) => setScalePreset(Number(event.target.value))}
                  >
                    {scalePresets.map((preset) => (
                      <option key={preset} value={preset}>
                        {preset}x
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label className="text-xs text-slate-300">
                    Width
                    <input
                      className="mt-1 block w-24 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                      value={customWidth}
                      onChange={(event) => setCustomWidth(event.target.value)}
                    />
                  </label>
                  <label className="text-xs text-slate-300">
                    Height
                    <input
                      className="mt-1 block w-24 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                      value={customHeight}
                      onChange={(event) => setCustomHeight(event.target.value)}
                    />
                  </label>
                </>
              )}

              <label className="text-xs text-slate-300">
                Format
                <select
                  className="mt-1 block rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                  value={exportFormat}
                  onChange={(event) => setExportFormat(event.target.value as RasterFormat)}
                >
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="webp">WEBP</option>
                </select>
              </label>

              <label className="text-xs text-slate-300">
                Jakosc ({quality.toFixed(2)})
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.01}
                  value={quality}
                  onChange={(event) => setQuality(Number(event.target.value))}
                  className="mt-2 block w-36"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void exportSceneImage(exportFormat)}
                disabled={isRendering}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                Eksportuj {exportFormat.toUpperCase()}
              </button>
              <button
                type="button"
                onClick={() => void exportAllFormats()}
                disabled={isRendering}
                className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Eksportuj PNG/JPEG/WEBP
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, delay: 0.05 }}
          className="flex min-h-[560px] flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-slate-300">Podglad bitmapy RGBA</p>
            <motion.p
              key={status}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="text-xs text-slate-400"
            >
              {status}
            </motion.p>
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-950 p-2">
            <motion.canvas
              ref={canvasRef}
              initial={{ opacity: 0.2 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35 }}
              className="max-h-full max-w-full rounded"
            />
          </div>
        </motion.div>
      </section>
    </main>
  );
}
