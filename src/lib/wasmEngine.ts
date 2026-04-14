import type { SceneDefinition } from "./scene";

type EmscriptenModule = {
  ccall: <T>(
    ident: string,
    returnType: "number" | "string" | "boolean" | null,
    argTypes: Array<"number" | "string" | "boolean">,
    args: unknown[]
  ) => T;
  HEAPU8: Uint8Array;
};

export type WasmEngine = {
  render(scene: SceneDefinition): Uint8ClampedArray;
};

let loadPromise: Promise<WasmEngine> | null = null;

export function loadWasmEngine(): Promise<WasmEngine> {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const wasmModulePath = "/wasm/vector_engine.js";
    const factoryModule = await import(/* @vite-ignore */ wasmModulePath);
    const factory = factoryModule.default as () => Promise<EmscriptenModule>;
    const module = await factory();

    return {
      render(scene: SceneDefinition) {
        const sceneJson = JSON.stringify(scene);
        const ptr = module.ccall<number>(
          "render_scene",
          "number",
          ["string", "number", "number"],
          [sceneJson, scene.width, scene.height]
        );
        const size = module.ccall<number>("get_buffer_size", "number", [], []);

        if (!ptr || size <= 0) {
          throw new Error("WASM zwrocil pusty bufor renderowania.");
        }

        return new Uint8ClampedArray(module.HEAPU8.slice(ptr, ptr + size));
      },
    };
  })();

  return loadPromise;
}