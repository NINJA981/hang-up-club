/**
 * Play a cheer the coach recorded. It may have been recorded in a container
 * this browser cannot decode (SPEC section 11): then `ok` is false and the UI
 * shows the coach's text instead, with no error dialog (AC-F8-6).
 */
export interface CheerPlayback {
  ok: boolean;
  stop(): void;
}

export async function playCheer(blob: Blob): Promise<CheerPlayback> {
  const none: CheerPlayback = { ok: false, stop: () => undefined };
  if (typeof AudioContext === 'undefined') return none;
  let ctx: AudioContext | undefined;
  try {
    ctx = new AudioContext();
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const owned = ctx;
    src.onended = () => {
      void owned.close().catch(() => undefined);
    };
    await ctx.resume();
    src.start();
    return {
      ok: true,
      stop() {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      },
    };
  } catch {
    void ctx?.close().catch(() => undefined);
    return none;
  }
}
