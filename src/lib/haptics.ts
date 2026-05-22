// Cross-platform haptics: uses Capacitor Haptics on native, Web Vibration API in browser.
export async function buzz(pattern: number | number[] = 30) {
  try {
    // Try Capacitor first (works inside the native wrapper)
    const cap = (globalThis as any).Capacitor;
    if (cap?.isNativePlatform?.()) {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Medium });
      return;
    }
  } catch {
    /* fall through to web vibration */
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

export async function celebrate() {
  await buzz([40, 60, 40, 60, 120]);
}
