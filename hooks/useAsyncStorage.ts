import AsyncStorage from '@react-native-async-storage/async-storage'
import { useState, useEffect } from 'react'

/**
 * a hook to store and retrieve values from persistent storage.
 * @returns a tuple containing the stored value and a function to set the value
 */
export const useAsyncStorage = <T>(
  /** the key to store the value under */
  key: string,
  /** the initial value to store */
  initialValue: T,
) => {
  const [storedValue, setStoredValue] = useState<T>(initialValue)
  // load the value from storage when the key changes
  useEffect(() => {
    const loadValue = async () => {
      try {
        const item = await AsyncStorage.getItem(key)
        if (item) {
          setStoredValue(JSON.parse(item))
        }
      } catch (error) {
        console.error('Error loading from AsyncStorage:', error)
      }
    }

    void loadValue()
  }, [key])
  // provide a function to set the value
  const setValue = async (value: T) => {
    try {
      const serializedValue = JSON.stringify(value)
      await AsyncStorage.setItem(key, serializedValue)
      setStoredValue(value)
    } catch (error) {
      console.error('Error storing to AsyncStorage:', error)
    }
  }
  return [storedValue, setValue] as const
}
