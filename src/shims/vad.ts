interface VadLib {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MicVAD: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  utils: any;
}

const vad = (window as unknown as { vad: VadLib }).vad;
export default vad;
export const MicVAD = vad?.MicVAD;
export const utils = vad?.utils;
