declare const __DEV__: boolean;

export function log(...args: unknown[]): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(...args);
  }
}

export function warn(...args: unknown[]): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(...args);
  }
}

export function error(...args: unknown[]): void {
  console.error(...args);
}

export const logger = {
  log,
  warn,
  error,
};

export default logger;
