import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.loyaltyclay",
  appName: "Clay Loyalty",
  webDir: "dist/client",
  server: {
    androidScheme: "https",
  },
};

export default config;
