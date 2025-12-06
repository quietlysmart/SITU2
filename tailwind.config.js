/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          cream: '#FDFBF7', // Much lighter, subtle cream
          brown: '#3E342B',
          gold: '#C8B273', // Muted, earthy gold
          olive: '#999578',
          olive: '#999578',
          'olive-dark': '#7A765A', // Darker olive for hover
          sand: '#EAE7DC',
        },
      },
      fontFamily: {
        serif: ['Fraunces', 'serif'],
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

