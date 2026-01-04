// Shim for onnxruntime-web
// This relies on <script src="ort.all.min.js"></script> in index.html
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ort = (window as any).ort;
export default ort;
export const Tensor = ort?.Tensor;
export const InferenceSession = ort?.InferenceSession;
export const env = ort?.env;
