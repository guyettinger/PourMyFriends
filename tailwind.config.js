const { hairlineWidth } = require('nativewind/theme')
const { COLORS } = require('./lib/colors')

const toCssVariables = (theme) => {
  const cssVariables = {}
  Object.entries(theme).forEach(([key, value]) => {
    cssVariables[`--${key}`] = value
  })
  return cssVariables
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      screens: {
        '3xl': '1920px',
      },
      fontFamily: {
        inter: ['InterDisplay-Regular'],
        'inter-bold': ['InterDisplay-Bold'],
        'sf-pro': ['SF-Pro-Display-Regular'],
        'sf-pro-thin': ['SF-Pro-Display-Thin'],
        'sf-pro-semibold': ['SF-Pro-Display-Semibold'],
        'sf-pro-bold': ['SF-Pro-Display-Bold'],
      },
      colors: {
        title: 'var(--title)',
        subtitle: 'var(--subtitle)',
        'subtitle-muted': 'var(--subtitle-muted)',
        paragraph: 'var(--paragraph)',
        'selection-default': 'var(--selection-default)',
        'selection-active': 'var(--selection-active)',
        header: 'var(--header)',
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
      boxShadow: {
        button: '0px 0px 12px 0 #00000033',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    ({ addBase }) =>
      addBase({
        ':root': toCssVariables(COLORS.light),
        '.dark:root': toCssVariables(COLORS.dark),
      }),
  ],
}
