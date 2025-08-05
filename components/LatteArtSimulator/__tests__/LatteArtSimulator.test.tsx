import React from 'react';
import { render } from '@testing-library/react-native';
import { LatteArtSimulator } from '../LatteArtSimulator';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Mock the react-native-skia module
jest.mock('@shopify/react-native-skia', () => {
  const mockSkia = {
    Canvas: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Image: () => <div>Skia Image</div>,
    Circle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Paint: () => <div>Skia Paint</div>,
    useCanvasRef: jest.fn(() => ({ current: {} })),
    // Add AlphaType and ColorType enums
    AlphaType: {
      Unknown: 0,
      Opaque: 1,
      Premul: 2,
      Unpremul: 3
    },
    ColorType: {
      Unknown: 0,
      Alpha_8: 1,
      RGB_565: 2,
      ARGB_4444: 3,
      RGBA_8888: 4,
      RGB_888x: 5,
      BGRA_8888: 6
    },
    Skia: {
      Data: {
        fromBytes: jest.fn(() => ({})),
      },
      Image: {
        MakeImage: jest.fn(() => ({})),
      },
    },
  };
  return mockSkia;
});

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const mockReanimated = {
    useSharedValue: jest.fn((initialValue) => ({ value: initialValue })),
    useDerivedValue: jest.fn((callback) => ({ value: callback() })),
  };
  return mockReanimated;
});

// Mock the react-native-gesture-handler module
jest.mock('react-native-gesture-handler', () => {
  const mockGestureHandler = {
    GestureDetector: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Gesture: {
      Pan: jest.fn(() => ({
        onStart: jest.fn().mockReturnThis(),
        onUpdate: jest.fn().mockReturnThis(),
        onEnd: jest.fn().mockReturnThis(),
      })),
    },
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
  return mockGestureHandler;
});

describe('LatteArtSimulator', () => {
  it('renders correctly', () => {
    const { getByText } = render(
      <GestureHandlerRootView>
        <LatteArtSimulator width={300} height={300} />
      </GestureHandlerRootView>
    );
    
    // Check that the tool buttons are rendered
    expect(getByText('Milk')).toBeTruthy();
    expect(getByText('Spoon')).toBeTruthy();
    expect(getByText('Pen')).toBeTruthy();
    expect(getByText('Chocolate')).toBeTruthy();
    
    // Check that the action buttons are rendered
    expect(getByText('Pause')).toBeTruthy();
    expect(getByText('Reset')).toBeTruthy();
  });
  
  it('renders with default dimensions when not provided', () => {
    const { getByText } = render(
      <GestureHandlerRootView>
        <LatteArtSimulator />
      </GestureHandlerRootView>
    );
    
    // Check that the component renders with default dimensions
    expect(getByText('Milk')).toBeTruthy();
  });
});