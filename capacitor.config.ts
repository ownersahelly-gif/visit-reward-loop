import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.loyaltyclay",
  appName: "Clay Loyalty",
  webDir: "dist/client",
  server: {
    // TanStack Start is SSR — we load the published web app instead of
    // bundling static assets. Replace with your custom domain when ready.
    url: "https://visit-reward-loop.lovable.app",
    cleartext: false,
    androidScheme: "https",
  },
};

export default config;
