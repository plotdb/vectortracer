/* tslint:disable */
/* eslint-disable */
export interface BinaryImageConverterParams {
    debug: boolean | undefined;
    mode?: 'polygon'|'spline'|'none';
    cornerThreshold?: number;
    lengthThreshold?: number;
    maxIterations?: number;
    spliceThreshold?: number;
    filterSpeckle?: number;
    pathPrecision?: number;
}

export interface ColorImageConverterParams {
    debug: boolean | undefined;
    mode?: 'polygon'|'spline'|'none';
    cornerThreshold?: number;
    lengthThreshold?: number;
    maxIterations?: number;
    spliceThreshold?: number;
    filterSpeckle?: number;
    pathPrecision?: number;
    colorPrecision?: number;
    layerDifference?: number;
}

export interface Options {
    invert: boolean | undefined;
    pathFill: string | undefined;
    backgroundColor: string | undefined;
    attributes: string | undefined;
    scale?: number;
}

export interface RawImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
}


export class BinaryImageConverter {
    free(): void;
    [Symbol.dispose](): void;
    getResult(): string;
    init(): void;
    constructor(imageData: ImageData, converterOptions: BinaryImageConverterParams, options: Options);
    progress(): number;
    tick(): boolean;
}

export class ColorImageConverter {
    free(): void;
    [Symbol.dispose](): void;
    getResult(): string;
    init(): void;
    constructor(imageData: ImageData, converterOptions: ColorImageConverterParams, options: Options);
    progress(): number;
    tick(): boolean;
}

export function main(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_binaryimageconverter_free: (a: number, b: number) => void;
    readonly __wbg_colorimageconverter_free: (a: number, b: number) => void;
    readonly binaryimageconverter_getResult: (a: number) => [number, number];
    readonly binaryimageconverter_init: (a: number) => void;
    readonly binaryimageconverter_new: (a: any, b: any, c: any) => number;
    readonly binaryimageconverter_progress: (a: number) => number;
    readonly binaryimageconverter_tick: (a: number) => number;
    readonly colorimageconverter_getResult: (a: number) => [number, number];
    readonly colorimageconverter_init: (a: number) => void;
    readonly colorimageconverter_new: (a: any, b: any, c: any) => number;
    readonly colorimageconverter_progress: (a: number) => number;
    readonly colorimageconverter_tick: (a: number) => number;
    readonly main: () => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
