/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class', // Включаем поддержку темной темы
    theme: {
        extend: {
            colors: {
                accent: {
                    DEFAULT: '#6366f1',
                    hover: '#5558e0',
                    dim: 'rgba(99, 102, 241, 0.1)',
                }
            }
        },
    },
    plugins: [],
}