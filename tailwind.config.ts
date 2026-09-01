import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        amber: "#ff9800",
        "light-grey": "#212121",
      },
    },
  },
} satisfies Config;
