import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { LatteArtSimulator } from '../../components/LatteArtSimulator';

/**
 * Latte Art Simulator Demo Screen
 */
export default function LatteArtScreen() {
  const { width } = useWindowDimensions();
  
  // Calculate simulator size (90% of screen width, but not more than 500px)
  const simulatorSize = Math.min(width * 0.9, 500);
  
  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Latte Art Simulator',
          headerStyle: {
            backgroundColor: '#1a1a1a',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Latte Art Simulator</Text>
          <Text style={styles.subtitle}>
            Create beautiful latte art with fluid simulation
          </Text>
        </View>
        
        <View style={styles.simulatorContainer}>
          <LatteArtSimulator 
            width={simulatorSize} 
            height={simulatorSize}
            enablePerformanceMonitoring={true}
            onPerformanceUpdate={(fps, frameTime) => {
              // Optional: Log performance metrics for debugging
              if (__DEV__) {
                console.log(`Latte Art Simulator - FPS: ${fps}, Frame Time: ${frameTime}ms`);
              }
            }}
          />
        </View>
        
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsTitle}>How to use:</Text>
          <Text style={styles.instructionText}>
            1. Adjust Quality settings for optimal performance on your device
          </Text>
          <Text style={styles.instructionText}>
            2. Select a tool from the Tools section
          </Text>
          <Text style={styles.instructionText}>
            3. Touch and drag on the cup to create latte art
          </Text>
          <Text style={styles.instructionText}>
            4. Use the Milk tool to pour milk into the espresso
          </Text>
          <Text style={styles.instructionText}>
            5. Use the Spoon tool to stir and create patterns
          </Text>
          <Text style={styles.instructionText}>
            6. Use the Pen tool for fine details
          </Text>
          <Text style={styles.instructionText}>
            7. Add chocolate accents with the Chocolate tool
          </Text>
          <Text style={styles.instructionText}>
            8. Monitor FPS and performance metrics in real-time
          </Text>
          <Text style={styles.instructionText}>
            9. Press Reset to start over
          </Text>
        </View>
        
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsTitle}>Performance Features:</Text>
          <Text style={styles.instructionText}>
            • Quality presets automatically optimize for your device
          </Text>
          <Text style={styles.instructionText}>
            • Low: 80×80 resolution, 8 iterations, 30fps target
          </Text>
          <Text style={styles.instructionText}>
            • Medium: 120×120 resolution, 12 iterations, 45fps target
          </Text>
          <Text style={styles.instructionText}>
            • High: 160×160 resolution, 16 iterations, 60fps target
          </Text>
          <Text style={styles.instructionText}>
            • Ultra: 200×200 resolution, 20 iterations, 60fps target
          </Text>
          <Text style={styles.instructionText}>
            • Adaptive quality adjusts automatically for smooth performance
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
  },
  simulatorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  instructionsContainer: {
    padding: 20,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    marginHorizontal: 20,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  instructionText: {
    fontSize: 14,
    color: '#ddd',
    marginBottom: 8,
    lineHeight: 20,
  },
});