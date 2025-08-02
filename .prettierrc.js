/** @type {import("prettier").Options} */
const config = {
  // https://tailwindcss.com/blog/automatic-class-sorting-with-prettier
  plugins: ['prettier-plugin-tailwindcss'],
  singleQuote: true,
  semi: false,
  printWidth: 120,
}

module.exports = config
