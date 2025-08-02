import { Children, forwardRef, isValidElement, ReactElement, ReactNode, useState } from 'react'
import {
  GestureResponderEvent,
  MouseEvent,
  NativeSyntheticEvent,
  Pressable,
  PressableProps,
  TargetedEvent,
} from 'react-native'
import { PressableRef } from '@rn-primitives/types'
import { cn } from '~/lib/utilities/cn'
import { View } from '~/components/primitives/View'

/** Content - props */
export interface ContentProps {
  children?: ReactNode
}

/** Content - content to display by default */
export const Content = ({ children }: ContentProps) => {
  return <>{children}</>
}

/** HoveredContent - content to display when hovered */
export const HoveredContent = ({ children }: ContentProps) => {
  return <>{children}</>
}

/** FocusedContent - content to display when focused */
export const FocusedContent = ({ children }: ContentProps) => {
  return <>{children}</>
}

/** PressedContent - content to display when pressed */
export const PressedContent = ({ children }: ContentProps) => {
  return <>{children}</>
}

/** Content - content element guard */
const isContentElement = (child: ReactElement): child is ReactElement<ContentProps> => {
  const childType = child.type
  return (
    childType === HoveredContent ||
    childType === FocusedContent ||
    childType === PressedContent ||
    childType === Content
  )
}

/** StyledPressable - props */
export interface StyledPressableProps extends PressableProps {
  /** children components */
  children?: ReactNode
  /** class name applied on hover */
  hoveredClassName?: string
  /** class name applied on focus */
  focusedClassName?: string
  /** class name applied on press */
  pressedClassName?: string
}
/** StyledPressable - react native pressable style wrapper */
export const StyledPressable = forwardRef<PressableRef, StyledPressableProps>(
  (
    {
      className,
      hoveredClassName = '',
      focusedClassName = '',
      pressedClassName = '',
      onHoverIn,
      onHoverOut,
      onFocus,
      onBlur,
      onPressIn,
      onPressOut,
      children,
      ...props
    }: StyledPressableProps,
    ref,
  ) => {
    // hovered
    const [isHovered, setIsHovered] = useState(false)
    const handleOnHoverIn = (event: MouseEvent) => {
      setIsHovered(true)
      onHoverIn?.(event)
    }
    const handleOnHoverOut = (event: MouseEvent) => {
      setIsHovered(false)
      onHoverOut?.(event)
    }

    // focused
    const [isFocused, setIsFocused] = useState(false)
    const handleOnFocus = (event: NativeSyntheticEvent<TargetedEvent>) => {
      setIsFocused(true)
      onFocus?.(event)
    }
    const handleOnBlur = (event: NativeSyntheticEvent<TargetedEvent>) => {
      setIsFocused(false)
      onBlur?.(event)
    }

    // pressed
    const [isPressed, setIsPressed] = useState(false)
    const handleOnPressIn = (event: GestureResponderEvent) => {
      setIsPressed(true)
      onPressIn?.(event)
    }
    const handleOnPressOut = (event: GestureResponderEvent) => {
      setIsPressed(false)
      onPressOut?.(event)
    }

    // find child components by type
    let defaultContent: ReactNode = null
    let hoveredContent: ReactNode = null
    let focusedContent: ReactNode = null
    let pressedContent: ReactNode = null
    Children.forEach(children, (child) => {
      if (isValidElement(child) && isContentElement(child)) {
        const childType = child.type
        if (childType === HoveredContent) {
          hoveredContent = child.props.children
        } else if (childType === FocusedContent) {
          focusedContent = child.props.children
        } else if (childType === PressedContent) {
          pressedContent = child.props.children
        } else if (childType === Content) {
          defaultContent = child.props.children
        }
      } else if (isValidElement(child)) {
        // if not a special component, treat as default content
        defaultContent = child
      } else {
        // if not a valid element, treat as default content
        defaultContent = child
      }
    })

    // choose content based on state
    const content =
      isPressed && pressedContent
        ? pressedContent
        : isHovered && hoveredContent
          ? hoveredContent
          : isFocused && focusedContent
            ? focusedContent
            : defaultContent

    return (
      <Pressable
        ref={ref}
        onHoverIn={handleOnHoverIn}
        onHoverOut={handleOnHoverOut}
        onFocus={handleOnFocus}
        onBlur={handleOnBlur}
        onPressIn={handleOnPressIn}
        onPressOut={handleOnPressOut}
        {...props}
      >
        <View
          className={cn(
            className,
            isHovered && hoveredClassName,
            isFocused && focusedClassName,
            isPressed && pressedClassName,
          )}
        >
          {content}
        </View>
      </Pressable>
    )
  },
)
StyledPressable.displayName = 'Pressable'
