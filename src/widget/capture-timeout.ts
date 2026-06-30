const CAPTURE_TIMEOUT_MS = 15_000;

export function withCaptureTimeout<T>(capturePromise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Screenshot capture timed out  Ethe page may be too complex')),
      CAPTURE_TIMEOUT_MS
    );
  });

  return Promise.race([capturePromise, timeoutPromise]).finally(() => clearTimeout(timer!));
}
