/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    fontSize: {
      xs: ["12px", "1.5"],
      sm: ["14px", "1.5"],
      base: ["16px", "1.5"],
      lg: ["18px", "1.5"],
      xl: ["20px", "1.3"],
      "2xl": ["24px", "1.2"],
    },
    spacing: {
      0: "0px",
      0.5: "2px",
      1: "4px",
      1.5: "6px",
      2: "8px",
      2.5: "10px",
      3: "12px",
      3.5: "14px",
      4: "16px",
      5: "20px",
      6: "24px",
      8: "32px",
      10: "40px",
      12: "48px",
      16: "64px",
      24: "96px",
      32: "128px",
      96: "384px",
    },
    extend: {},
  },
  corePlugins: {
    preflight: true,
  },
  plugins: [],
};
