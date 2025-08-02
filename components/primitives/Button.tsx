import { ReactNode, forwardRef } from 'react'
import { TextProps } from 'react-native'
import { vars } from 'nativewind'
import { cn } from '~/lib/utilities/cn'
import { useScale } from '~/hooks/useScale'
import { StyledPressable, StyledPressableProps } from '~/components/primitives/StyledPressable'
import { Text } from '~/components/primitives/Text'
import { View } from '~/components/primitives/View'
import { PressableRef } from '@rn-primitives/types'

/** Button Text - design properties */
export interface ButtonTextDesignProps {
  /** Text height */
  textHeight: number
  /** Line height */
  leading: number
}

/** Button Text - design */
const buttonTextDesignDefaults: ButtonTextDesignProps = {
  textHeight: 16,
  leading: 19,
}

/** Button Text - props */
export interface ButtonTextProps extends TextProps, Partial<ButtonTextDesignProps> {}

/** Button - text */
export const ButtonText = ({
  children,
  className,
  textHeight = buttonTextDesignDefaults.textHeight,
  leading = buttonTextDesignDefaults.leading,
}: ButtonTextProps) => {
  const { dp } = useScale()
  return (
    <Text
      style={vars({
        textHeight: dp(textHeight),
        leading: dp(leading),
      })}
      className={cn('font-sf-pro-semibold text-[length:--textHeight] leading-[--leading]', className)}
    >
      {children}
    </Text>
  )
}

/** Button Content - design properties */
export interface ButtonContentDesignProps {
  /** Gap between symbol and text */
  gap: number
}

/** Button Content - design */
const buttonContentDesignDefaults: ButtonContentDesignProps = {
  gap: 8,
}

/** Button - content props */
export interface ButtonContentProps extends TextProps, Partial<ButtonContentDesignProps> {
  /** Button symbol */
  symbol?: ReactNode
  /** Button text */
  text?: ReactNode
}
/** Button - content */
export const ButtonContent = ({
  symbol,
  text,
  className,
  gap = buttonContentDesignDefaults.gap,
}: ButtonContentProps) => {
  const { dp } = useScale()
  return (
    <ButtonText className={cn('text-white', className)}>
      <View
        style={vars({
          gap: dp(gap),
        })}
        className="flex flex-row gap-[--gap]"
      >
        {symbol}
        {text}
      </View>
    </ButtonText>
  )
}

/** Button - design properties */
export interface ButtonDesignProps {
  /** Height of the button */
  height: number
  /** Width of the button */
  width: number
  /** Horizontal padding */
  paddingHorizontal: number
  /** Vertical padding */
  paddingVertical: number
  /** Border radius */
  borderRadius: number
}

/** Button - design */
const buttonDesignDefaults: ButtonDesignProps = {
  height: 44,
  width: 236,
  paddingHorizontal: 16,
  paddingVertical: 8,
  borderRadius: 11,
}

/** Button - props */
export interface ButtonProps extends StyledPressableProps, Partial<ButtonDesignProps> {
  className?: string
  hoveredClassName?: string
  focusedClassName?: string
  pressedClassName?: string
}

/** Button */
export const Button = forwardRef<PressableRef, ButtonProps>(
  (
    {
      className,
      hoveredClassName,
      focusedClassName,
      pressedClassName,
      height = buttonDesignDefaults.height,
      width = buttonDesignDefaults.width,
      paddingHorizontal = buttonDesignDefaults.paddingHorizontal,
      paddingVertical = buttonDesignDefaults.paddingVertical,
      borderRadius = buttonDesignDefaults.borderRadius,
      children,
      ...props
    },
    ref,
  ) => {
    const { dp } = useScale()
    return (
      <StyledPressable
        ref={ref}
        style={[
          vars({
            h: dp(height),
            w: dp(width),
            px: dp(paddingHorizontal),
            py: dp(paddingVertical),
            rounded: dp(borderRadius),
          }),
        ]}
        className={cn(
          '[--w] flex h-[--h] flex-col items-center justify-center rounded-[--rounded] bg-[#6B6B6B80] px-[--px] py-[--py] shadow-button',
          className,
        )}
        hoveredClassName={cn('bg-[#FFFFFF]', hoveredClassName)}
        focusedClassName={cn('bg-[#FFFFFF]', focusedClassName)}
        pressedClassName={cn('bg-[#FFFFFF]', pressedClassName)}
        {...props}
      >
        {children}
      </StyledPressable>
    )
  },
)
Button.displayName = 'Button'
