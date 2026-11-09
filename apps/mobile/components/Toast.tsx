// apps/mobile/components/Toast.tsx
//
// Stage 1 import path kept working: the implementation moved to components/ui/Toast.tsx
// (global ToastProvider mounted in app/_layout.tsx). `useToast().show(message)` is unchanged.
export { ToastProvider, useToast } from './ui/Toast';
export type { ToastOptions, ToastTone } from './ui/Toast';
