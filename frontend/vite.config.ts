import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import vinext from "vinext";

export default defineConfig(({ command }) => ({
  plugins: [tailwindcss(), vinext(), command === "build" ? nitro() : null].filter(Boolean),
}));
